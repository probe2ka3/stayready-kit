import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { restrictedConnectorIds, SOURCE_REGISTRY } from '@cabas/core';

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
          if (privateIds.test(line) && amount.test(line)) offending.push(`${f}:${i + 1}`);
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
      if ((typeof owner === 'string' && restricted.includes(owner)) || privateProduct) {
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

  it('chaque source restreinte est déclarée « usage privé » ou soumise à autorisation', () => {
    for (const id of restricted) expect(SOURCE_REGISTRY[id]?.publicUse).toBe('requires_authorization');
  });
});
