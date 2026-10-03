import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { restrictedConnectorIds } from '@cabas/core';
import {
  besoin,
  enregistrer,
  joursConsecutifs,
  lireJournal,
  libererVerrou,
  noter,
  prendreVerrou,
  restaurer,
  SOURCES_PRIVEES,
  SOURCES_QUOTIDIENNES,
} from '../../../ops/actions-prive/etat.mjs';
import { DAILY_SOURCES } from '../src/daily-prices';

/** État partagé GitHub / Windows (ops/actions-prive/etat.mjs) : un seul journal, une collecte par jour. */
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'tesprix-etat-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const ecrire = (path: string, data: unknown) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
};
const run = (date: string, startedAt: string, statuts: Record<string, string>) => ({
  date,
  startedAt,
  finishedAt: startedAt,
  sources: Object.entries(statuts).map(([connector, status]) => ({ connector, status, prices: 10, promotions: 1, message: status === 'failed' ? 'HTTP 503' : null })),
});

describe('état partagé de la collecte quotidienne', () => {
  it('listes alignées sur le code : sources privées et sources quotidiennes', () => {
    expect([...SOURCES_PRIVEES].sort()).toEqual([...restrictedConnectorIds([])].sort());
    expect([...SOURCES_QUOTIDIENNES].sort()).toEqual([...DAILY_SOURCES].sort());
  });

  it('une collecte par jour de Zurich ; reprise des seules sources en échec ; verrou respecté', () => {
    const etat = tmp();
    const matin = new Date('2026-10-04T04:20:00Z'); // 06:20 à Zurich
    expect(besoin(etat, { maintenant: matin })).toMatchObject({ collecte: true });
    ecrire(join(etat, 'private', 'runs', 'latest.json'), run('2026-10-04', '2026-10-04T04:17:00Z', { 'open-prices': 'success', 'denner-web': 'success' }));
    expect(besoin(etat, { maintenant: matin })).toMatchObject({ collecte: false });
    // Lendemain à 00:30 heure de Zurich (22:30 UTC la veille) : nouvelle journée.
    expect(besoin(etat, { maintenant: new Date('2026-10-04T22:30:00Z') })).toMatchObject({ collecte: true });
    ecrire(join(etat, 'private', 'runs', 'latest.json'), run('2026-10-04', '2026-10-04T04:17:00Z', { 'open-prices': 'success', 'denner-web': 'failed' }));
    expect(besoin(etat, { maintenant: matin }).raison).toContain('denner-web');
    // Verrou d'un autre système : rien, même forcé ; verrou abandonné (> 2 h) : ignoré.
    expect(prendreVerrou(etat, 'windows', { maintenant: matin })).toBe(true);
    expect(prendreVerrou(etat, 'github', { maintenant: new Date('2026-10-04T04:40:00Z') })).toBe(false);
    expect(besoin(etat, { force: true, maintenant: new Date('2026-10-04T04:40:00Z') })).toMatchObject({ collecte: false });
    expect(besoin(etat, { maintenant: new Date('2026-10-04T07:30:00Z') })).toMatchObject({ collecte: true });
    libererVerrou(etat);
    expect(existsSync(join(etat, 'verrou.json'))).toBe(false);
  });

  it('enregistrer / restaurer : données conservées, jamais d’instantané privé parmi les publiables ni d’archive', () => {
    const data = tmp();
    const etat = tmp();
    ecrire(join(data, 'private', 'live', 'aldi-api.json'), { connectorId: 'aldi-api', collectedAt: '2026-10-04T04:30:00Z' });
    ecrire(join(data, 'private', 'runs', 'latest.json'), run('2026-10-04', '2026-10-04T04:17:00Z', {}));
    ecrire(join(data, 'private', 'runs', 'quotidien.lock'), {});
    ecrire(join(data, 'private', 'cache', 'http', 'x.json'), {});
    ecrire(join(data, 'raw', 'www.denner.ch', 'page.html'), {});
    ecrire(join(data, 'prices', 'live', 'lidl-web.json'), { connectorId: 'lidl-web', collectedAt: '2026-10-04T04:35:00Z' });
    ecrire(join(data, 'prices', 'live', 'denner-web.json'), { connectorId: 'denner-web', collectedAt: '2026-10-04T04:35:00Z' });
    enregistrer(data, etat);
    expect(readdirSync(join(etat, 'prices-live'))).toEqual(['lidl-web.json']);
    expect(existsSync(join(etat, 'private', 'live', 'aldi-api.json'))).toBe(true);
    expect(existsSync(join(etat, 'private', 'runs', 'quotidien.lock'))).toBe(false);
    expect(existsSync(join(etat, 'private', 'cache'))).toBe(false);
    expect(existsSync(join(etat, 'raw'))).toBe(false);
    // Serveur neuf : le code apporte un instantané Lidl plus ancien, l'état le remplace ; jamais l'inverse.
    const neuf = tmp();
    ecrire(join(neuf, 'prices', 'live', 'lidl-web.json'), { connectorId: 'lidl-web', collectedAt: '2026-10-01T04:35:00Z' });
    restaurer(etat, neuf);
    expect(JSON.parse(readFileSync(join(neuf, 'prices', 'live', 'lidl-web.json'), 'utf8')).collectedAt).toBe('2026-10-04T04:35:00Z');
    expect(existsSync(join(neuf, 'private', 'live', 'aldi-api.json'))).toBe(true);
    ecrire(join(neuf, 'prices', 'live', 'lidl-web.json'), { connectorId: 'lidl-web', collectedAt: '2026-10-05T04:35:00Z' });
    restaurer(etat, neuf);
    expect(JSON.parse(readFileSync(join(neuf, 'prices', 'live', 'lidl-web.json'), 'utf8')).collectedAt).toBe('2026-10-05T04:35:00Z');
  });

  it('suivi : une source en échec rend l’exécution en échec (workflow rouge), même si la collecte a abouti', () => {
    const etat = tmp();
    ecrire(join(etat, 'private', 'runs', 'latest.json'), run('2026-10-04', '2026-10-04T04:17:30Z', { 'open-prices': 'success', 'denner-web': 'failed', 'lidl-web': 'partial' }));
    const r = noter(etat, { systeme: 'github', declencheur: 'schedule', debut: '2026-10-04T04:17:00Z', code: 0 });
    expect(r.ok).toBe(false);
    expect(r.echecs.map((s: { connector: string }) => s.connector)).toEqual(['denner-web']);
    expect(r.partiels.map((s: { connector: string }) => s.connector)).toEqual(['lidl-web']);
    const suivi = readFileSync(join(etat, 'suivi', 'SUIVI.md'), 'utf8');
    expect(suivi).toContain('ÉCHEC');
    expect(suivi).toContain('denner-web : HTTP 503');
    // Exécution sans collecte (déjà faite) : rien à signaler.
    expect(noter(etat, { systeme: 'github', declencheur: 'schedule', debut: '2026-10-04T07:47:00Z', issue: 'rien' }).ok).toBe(true);
    expect(lireJournal(etat).map((e: { issue: string }) => e.issue)).toEqual(['collecte', 'rien']);
  });

  it('sept jours : seuls comptent les jours consécutifs collectés par GitHub sur déclenchement planifié, sources lues', () => {
    const jour = (d: string, systeme: string, declencheur: string, statut = 'success') => ({
      jour: d,
      debut: `${d}T04:17:00Z`,
      systeme,
      declencheur,
      issue: 'collecte',
      sources: SOURCES_QUOTIDIENNES.map((connector: string) => ({ connector, status: statut })),
    });
    const semaine = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((d) => jour(d, 'github', 'schedule'));
    expect(joursConsecutifs(semaine)).toBe(7);
    // Lancement manuel, collecte par Windows, source en échec ou jour manquant : la série repart de zéro.
    expect(joursConsecutifs([...semaine.slice(0, 6), jour('2026-10-10', 'github', 'workflow_dispatch')])).toBe(0);
    expect(joursConsecutifs([...semaine.slice(0, 6), jour('2026-10-10', 'windows', 'windows-tache')])).toBe(0);
    expect(joursConsecutifs([...semaine.slice(0, 6), jour('2026-10-10', 'github', 'schedule', 'failed')])).toBe(0);
    expect(joursConsecutifs([...semaine.slice(0, 3), ...semaine.slice(4)])).toBe(3);
  });
});
