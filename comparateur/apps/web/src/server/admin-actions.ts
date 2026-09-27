'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { mergeBatches, parseImportFile, type ConnectorBatch } from '@cabas/connectors';
import { applyBatch, audit, finishRun, resolveAnomaly, reviewMatch, runQualityChecks, startRun } from '@cabas/db';
import { CHAINS } from '@cabas/reference';
import { adminConfigured, checkCredentials, createSessionToken, requireAdmin, SESSION_COOKIE, sessionCookieOptions } from './auth';
import { getPostgresData } from './data';
import { serverEnv } from './env';
import { errorInfo, log } from './log';
import { LIMITS, rateLimit } from './rate-limit';

async function clientKeyFromHeaders(): Promise<string> {
  const h = await headers();
  const ip = serverEnv.trustProxy ? (h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown') : 'unknown';
  return createHash('sha256').update(`${ip}|${serverEnv.sessionSecret}`).digest('base64url').slice(0, 16);
}

/* ---------------------------------------------------------------- */
/* Connexion                                                         */
/* ---------------------------------------------------------------- */

export interface LoginState {
  error: null | 'invalid' | 'not_configured' | 'rate_limited';
}

const loginSchema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) });

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!adminConfigured()) return { error: 'not_configured' };
  const limit = rateLimit(`login:${await clientKeyFromHeaders()}`, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!limit.ok) return { error: 'rate_limited' };
  const parsed = loginSchema.safeParse({ username: formData.get('username'), password: formData.get('password') });
  if (!parsed.success || !checkCredentials(parsed.data.username, parsed.data.password)) {
    log('warn', 'admin_login_failed');
    return { error: 'invalid' };
  }
  (await cookies()).set(SESSION_COOKIE, createSessionToken(parsed.data.username), sessionCookieOptions());
  const pg = getPostgresData();
  if (pg) await audit(pg.handle, parsed.data.username, 'admin.login', null, null).catch(() => {});
  redirect('/admin');
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/admin/login');
}

/* ---------------------------------------------------------------- */
/* Correspondances et anomalies                                      */
/* ---------------------------------------------------------------- */

const idSchema = z.string().min(1).max(200);

export async function reviewMatchAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const pg = getPostgresData();
  if (!pg) return;
  const parsed = z
    .object({
      canonicalId: idSchema,
      retailerProductId: idSchema,
      decision: z.enum(['validated', 'rejected']),
      kind: z.enum(['gtin', 'equivalent', 'similar']).optional(),
    })
    .safeParse({
      canonicalId: formData.get('canonicalId'),
      retailerProductId: formData.get('retailerProductId'),
      decision: formData.get('decision'),
      kind: formData.get('kind') || undefined,
    });
  if (!parsed.success) return;
  await reviewMatch(pg.handle, parsed.data.canonicalId, parsed.data.retailerProductId, { status: parsed.data.decision, kind: parsed.data.kind }, admin.username);
  revalidatePath('/admin/correspondances');
}

export async function resolveAnomalyAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const pg = getPostgresData();
  if (!pg) return;
  const parsed = z
    .object({ id: z.coerce.number().int().positive(), resolution: z.enum(['fixed', 'ignored', 'rejected_data']) })
    .safeParse({ id: formData.get('id'), resolution: formData.get('resolution') });
  if (!parsed.success) return;
  await resolveAnomaly(pg.handle, parsed.data.id, parsed.data.resolution, admin.username);
  revalidatePath('/admin/anomalies');
}

export async function runQualityAction(): Promise<void> {
  const admin = await requireAdmin();
  const pg = getPostgresData();
  if (!pg) return;
  const runId = await startRun(pg.handle, 'quality', 'quality', admin.username);
  const report = await runQualityChecks(pg.handle, new Date(), CHAINS);
  await finishRun(pg.handle, runId, 'success', { ...report });
  await audit(pg.handle, admin.username, 'quality.run', null, null, { ...report });
  revalidatePath('/admin');
}

/* ---------------------------------------------------------------- */
/* Import de fichiers                                                */
/* ---------------------------------------------------------------- */

export interface ImportState {
  done: boolean;
  dryRun?: boolean;
  error?: string;
  summary?: {
    products: number;
    prices: number;
    promotions: number;
    matchesValidated: number;
    matchesSuggested: number;
    rejected: Array<{ file?: string; line?: number; field?: string; message: string }>;
    warnings: Array<{ file?: string; line?: number; message: string }>;
    applied?: { products: number; prices: number; promotions: number; rejected: number };
  };
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function importAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const admin = await requireAdmin();
  const pg = getPostgresData();
  if (!pg) return { done: true, error: 'L’import nécessite la base PostgreSQL (DATA_BACKEND=postgres).' };
  const connectorId = String(formData.get('connector') ?? '');
  if (!CHAINS.some((c) => c.id === connectorId)) return { done: true, error: 'Enseigne inconnue.' };
  const dryRun = formData.get('dryRun') === 'on';
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { done: true, error: 'Aucun fichier.' };
  if (files.length > 10) return { done: true, error: '10 fichiers au maximum.' };
  const batches: ConnectorBatch[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) return { done: true, error: `${f.name} : 5 Mo au maximum.` };
    if (!/\.(csv|json)$/i.test(f.name)) return { done: true, error: `${f.name} : format CSV ou JSON attendu.` };
    batches.push(parseImportFile(await f.text(), f.name, { connectorId, chainId: connectorId, now: new Date() }));
  }
  const batch = mergeBatches(connectorId, batches);
  const summary: NonNullable<ImportState['summary']> = {
    products: batch.retailerProducts.length,
    prices: batch.prices.length,
    promotions: batch.promotions.length,
    matchesValidated: batch.matches.filter((m) => m.status === 'validated').length,
    matchesSuggested: batch.matches.filter((m) => m.status === 'suggested').length,
    rejected: batch.report.rejected.slice(0, 200),
    warnings: batch.report.warnings.slice(0, 200),
  };
  if (dryRun) return { done: true, dryRun: true, summary };
  try {
    const runId = await startRun(pg.handle, connectorId, 'file', admin.username);
    const res = await applyBatch(pg.handle, batch, runId);
    const issues = [...batch.report.rejected, ...res.rejected];
    await finishRun(pg.handle, runId, issues.length ? 'partial' : 'success', { ...res, files: files.map((f) => f.name) }, [
      ...issues,
      ...batch.report.warnings,
    ]);
    await audit(pg.handle, admin.username, 'import.file', 'import_run', String(runId), { connectorId, files: files.map((f) => f.name) });
    summary.applied = { products: res.products, prices: res.prices, promotions: res.promotions, rejected: res.rejected.length };
    revalidatePath('/admin');
    return { done: true, dryRun: false, summary };
  } catch (e) {
    log('error', 'admin_import_failed', errorInfo(e));
    return { done: true, error: 'L’import a échoué (voir le journal du serveur).' };
  }
}
