import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { connectorForUrl, restrictedConnectorIds, SOURCE_REGISTRY } from '@cabas/core';

/**
 * Garde-fou de publication : aucune donnée d'une source à usage privé (Aldi, Denner, journal Coop)
 * ne doit être versionnée — ni instantané, ni prix dans un export, une page ou un rapport.
 * Exceptions documentées : décisions de correspondance (identifiants et motifs, sans prix) et jeu de
 * validation (identifiants attendus et bornes de prix normalisé larges, pas de prix relevé).
 */
const root = join(__dirname, '..', '..', '..');
const restricted = restrictedConnectorIds([]);
const privateIds = /\b(?:aldi|denner):\d+|\bcoop:ep-[0-9a-f]+/;
const amount = /(?<![\d.])\d{1,4}\.\d{2}(?![\d.])/;
const EXEMPT = new Set(['data/matching/reviewed.json', 'data/validation/essentials.json']);
/** URL d'une source restreinte (provenance par l'hôte, quelle que soit l'étiquette portée par la donnée). */
const restrictedUrl = (u: unknown) => typeof u === 'string' && restricted.includes(connectorForUrl(u) ?? '');
const urlsIn = (line: string) => line.match(/https?:\/\/[^\s)"'<>|\]]+/g) ?? [];

function tracked(): string[] {
  try {
    return execFileSync('git', ['ls-files', '-z', 'data'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

const files = tracked();

describe.skipIf(files.length === 0)('données versionnées : aucune donnée de source à usage privé', () => {
  it('sources restreintes connues (Aldi, Denner, journal Coop)', () => {
    expect(restricted).toEqual(expect.arrayContaining(['aldi-api', 'denner-web', 'coop-epaper']));
  });

  it('rien sous data/private, aucun instantané d’une source restreinte', () => {
    expect(files.filter((f) => f.startsWith('data/private/'))).toEqual([]);
    expect(files.filter((f) => restricted.some((id) => f === `data/prices/live/${id}.json`))).toEqual([]);
  });

  it('aucun prix d’article Aldi, Denner ou Coop dans les exports, pages et rapports', () => {
    const offending: string[] = [];
    for (const f of files) {
      if (EXEMPT.has(f) || !/\.(md|html|csv|txt)$/.test(f)) continue;
      readFileSync(join(root, f), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if ((privateIds.test(line) || urlsIn(line).some(restrictedUrl)) && amount.test(line)) offending.push(`${f}:${i + 1}`);
        });
    }
    expect(offending).toEqual([]);
  });

  it('aucun montant attribué à une source restreinte dans les fichiers JSON', () => {
    const offending: string[] = [];
    const walk = (o: unknown, f: string, path: string) => {
      if (Array.isArray(o)) return o.forEach((x, i) => walk(x, f, `${path}[${i}]`));
      if (!o || typeof o !== 'object') return;
      const rec = o as Record<string, unknown>;
      const owner = [rec.connectorId, (rec.source as { connectorId?: unknown } | undefined)?.connectorId].find((x) => typeof x === 'string');
      const privateProduct = typeof rec.retailerProductId === 'string' && privateIds.test(rec.retailerProductId);
      const source = rec.source as { ref?: unknown } | undefined;
      const privateUrl = [rec.url, rec.sourceUrl, source?.ref].some(restrictedUrl);
      if ((typeof owner === 'string' && restricted.includes(owner)) || privateProduct || privateUrl) {
        for (const k of ['priceCents', 'promoPriceCents', 'referencePriceCents', 'totalCents']) {
          if (typeof rec[k] === 'number') offending.push(`${f} ${path}.${k}`);
        }
      }
      for (const [k, v] of Object.entries(rec)) walk(v, f, `${path}.${k}`);
    };
    for (const f of files) {
      if (EXEMPT.has(f) || !f.endsWith('.json')) continue;
      walk(JSON.parse(readFileSync(join(root, f), 'utf8')), f, '');
    }
    expect(offending).toEqual([]);
  });

  it('documentation : aucun montant associé à Aldi, Denner ou au journal Coop sans revue', () => {
    // Les rapports et guides sont publics : un prix issu d'un collecteur privé ne doit pas y figurer.
    // Toute ligne qui nomme ces sources avec un montant est signalée, sauf si elle a été revue
    // (montant d'une autre enseigne, coût de trajet, tarif d'un service…) : privacy-docs-revues.txt.
    const nomme = /\b(Aldi|Denner|coop-epaper|journal Coop)\b/i;
    const montant = /(?<![\d/])(?<!\d[.,])\d{1,4}[.,]\d{2}(?!\d|[.,]\d|\/|%)/;
    const neutre = /\d+\/\d+|CHF\/mois|par mois|requêtes|\d+\s*(Mo|Ko|km|min|s)\b|\b\d{1,2}\.\d{2}\.20\d{2}\b|\b(0?[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\b(?!\s*CHF)|\b\d{1,2}:\d{2}\b|\b\d+\.\d+\.\d+/g;
    const revues = new Set(
      readFileSync(join(__dirname, 'privacy-docs-revues.txt'), 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#')),
    );
    let tous: string[] = [];
    try {
      tous = execFileSync('git', ['ls-files', '-z', '.'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    } catch {
      return;
    }
    const offending: string[] = [];
    for (const f of tous) {
      if (f.startsWith('data/') || !/\.(md|html|txt)$/.test(f) || f === 'apps/worker/test/privacy-docs-revues.txt') continue;
      readFileSync(join(root, f), 'utf8')
        .split('\n')
        .forEach((line) => {
          if (!nomme.test(line) || /EXEMPLE|fictif/.test(line)) return;
          if (montant.test(line.replace(neutre, ' ')) && !revues.has(`${f} :: ${line.trim()}`)) offending.push(`${f} :: ${line.trim()}`);
        });
    }
    expect(offending).toEqual([]);
  });

  it('chaque source restreinte est déclarée « usage privé » ou soumise à autorisation', () => {
    for (const id of restricted) expect(SOURCE_REGISTRY[id]?.publicUse).toBe('requires_authorization');
  });
});
