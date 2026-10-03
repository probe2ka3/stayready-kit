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

  it('une collecte par jour de Zurich ; reprise des seules sources en échec ou incomplètes ; verrou respecté', () => {
    const etat = tmp();
    const matin = new Date('2026-10-04T04:20:00Z'); // 06:20 à Zurich
    expect(besoin(etat, { maintenant: matin })).toMatchObject({ collecte: true });
    ecrire(join(etat, 'private', 'runs', 'latest.json'), run('2026-10-04', '2026-10-04T04:17:00Z', { 'open-prices': 'success', 'denner-web': 'success' }));
    expect(besoin(etat, { maintenant: matin })).toMatchObject({ collecte: false });
    // Lendemain à 00:30 heure de Zurich (22:30 UTC la veille) : nouvelle journée.
    expect(besoin(etat, { maintenant: new Date('2026-10-04T22:30:00Z') })).toMatchObject({ collecte: true });
    ecrire(join(etat, 'private', 'runs', 'latest.json'), run('2026-10-04', '2026-10-04T04:17:00Z', { 'open-prices': 'success', 'denner-web': 'failed' }));
    expect(besoin(etat, { maintenant: matin }).raison).toContain('denner-web');
    // Source incomplète (pages manquantes) : reprise ; source bloquée : jamais le même jour.
    ecrire(join(etat, 'private', 'runs', 'latest.json'), run('2026-10-04', '2026-10-04T04:17:00Z', { 'open-prices': 'success', 'lidl-web': 'partial', 'aldi-api': 'blocked' }));
    expect(besoin(etat, { maintenant: matin })).toMatchObject({ collecte: true, raison: 'reprise des sources en échec ou incomplètes : lidl-web' });
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

  it('sept jours : seuls comptent les jours consécutifs où GitHub planifié a lu les 5 sources en succès', () => {
    const jour = (d: string, systeme: string, declencheur: string, statut = 'success', heure = '04:17', issue = 'collecte', ran: string[] = SOURCES_QUOTIDIENNES) => ({
      jour: d,
      debut: `${d}T${heure}:00Z`,
      systeme,
      declencheur,
      issue,
      // `statut` s'applique à lidl-web seule si `ran` est complet et le statut n'est pas « success »
      // (cas réel : une source partielle) ; les autres sources lues réussissent.
      sources:
        issue === 'collecte'
          ? SOURCES_QUOTIDIENNES.map((connector: string) => ({
              connector,
              status: ran.includes(connector) && (connector === 'lidl-web' || statut === 'failed') ? statut : 'success',
              lue: ran.includes(connector),
            }))
          : [],
    });
    const semaine = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((d) => jour(d, 'github', 'schedule'));
    expect(joursConsecutifs(semaine)).toBe(7);
    const dernier = (...e: object[]) => joursConsecutifs([...semaine.slice(0, 6), ...e]);
    // Lancement manuel, installation, collecte par Windows, « rien à faire » seul : ne prouvent rien.
    expect(dernier(jour('2026-10-10', 'github', 'workflow_dispatch'))).toBe(0);
    expect(dernier(jour('2026-10-10', 'github', 'push'))).toBe(0);
    expect(dernier(jour('2026-10-10', 'windows', 'windows-tache'))).toBe(0);
    expect(dernier(jour('2026-10-10', 'github', 'schedule', 'success', '04:17', 'rien'))).toBe(0);
    // Source en échec ou seulement partielle : jour non complet.
    expect(dernier(jour('2026-10-10', 'github', 'schedule', 'failed'))).toBe(0);
    expect(dernier(jour('2026-10-10', 'github', 'schedule', 'partial'))).toBe(0);
    // Partielle à 06:17, reprise réussie par le créneau planifié de 09:47 : jour complet.
    expect(dernier(jour('2026-10-10', 'github', 'schedule', 'partial'), jour('2026-10-10', 'github', 'schedule', 'success', '07:47', 'collecte', ['lidl-web']))).toBe(7);
    // … mais reprise faite par Windows : GitHub seul n'a pas tout lu, jour non complet.
    expect(dernier(jour('2026-10-10', 'github', 'schedule', 'partial'), jour('2026-10-10', 'windows', 'windows-tache', 'success', '13:30', 'collecte', ['lidl-web']))).toBe(0);
    // Un lancement manuel après une collecte planifiée complète ne retire rien.
    expect(dernier(jour('2026-10-10', 'github', 'schedule'), jour('2026-10-10', 'github', 'workflow_dispatch', 'success', '18:00'))).toBe(7);
    // Jour manquant : la série repart de zéro.
    expect(joursConsecutifs([...semaine.slice(0, 3), ...semaine.slice(4)])).toBe(3);
  });

  it('journal : deux exécutions commencées dans la même seconde restent dans l’ordre de leur fin', () => {
    const etat = tmp();
    const dir = join(etat, 'suivi', 'executions');
    // Noms de fichiers dans l'ordre inverse (suffixe aléatoire) : seul l'horodatage de fin départage.
    ecrire(join(dir, 'b.json'), { jour: '2026-10-04', debut: '2026-10-04T04:17:00Z', fin: '2026-10-04T04:17:00.100Z', issue: 'collecte' });
    ecrire(join(dir, 'a.json'), { jour: '2026-10-04', debut: '2026-10-04T04:17:00Z', fin: '2026-10-04T04:17:00.900Z', issue: 'echec' });
    expect(lireJournal(etat).map((e: { issue: string }) => e.issue)).toEqual(['collecte', 'echec']);
  });

  it('SUIVI.md : jalons distincts, volumes, contenu inchangé (normal) ≠ données anciennes (échec), jour sans déclenchement', () => {
    const etat = tmp();
    const instantane = (id: string, collectedAt: string, prix: number) => ({
      connectorId: id,
      collectedAt,
      status: 'success',
      batch: { prices: [{ retailerProductId: `${id}:1`, priceCents: prix, priceType: 'regular', observedAt: collectedAt }], promotions: [] },
    });
    const dossier = (c: string) => (SOURCES_PRIVEES.includes(c) ? join(etat, 'private', 'live', `${c}.json`) : join(etat, 'prices-live', `${c}.json`));
    // 03.10 : installation (push), 5 sources lues.
    for (const c of SOURCES_QUOTIDIENNES) ecrire(dossier(c), instantane(c, '2026-10-03T19:22:00Z', 100));
    ecrire(join(etat, 'private', 'runs', 'latest.json'), { ...run('2026-10-03', '2026-10-03T19:22:30Z', Object.fromEntries(SOURCES_QUOTIDIENNES.map((c: string) => [c, 'success']))), ran: SOURCES_QUOTIDIENNES });
    noter(etat, { systeme: 'github', declencheur: 'push', debut: '2026-10-03T19:22:00Z', code: 0, maintenant: new Date('2026-10-03T19:35:00Z') });
    let suivi = readFileSync(join(etat, 'suivi', 'SUIVI.md'), 'utf8');
    expect(suivi).toContain('Premier cycle manuel (installation ou lancement manuel) avec les 5 sources en succès : 03.10.2026 à 21:22 (push)');
    expect(suivi).toContain('(`schedule`) : **pas encore observé**');
    expect(suivi).toContain('0/7');
    expect(suivi).toContain('❌ aucun déclenchement planifié par GitHub');
    // 05.10 (le 04.10 sans exécution) : collecte planifiée ; journal Coop inchangé, Denner en échec.
    for (const c of SOURCES_QUOTIDIENNES.filter((x: string) => x !== 'denner-web')) ecrire(dossier(c), instantane(c, '2026-10-05T04:20:00Z', c === 'coop-epaper' ? 100 : 120));
    ecrire(join(etat, 'private', 'runs', 'latest.json'), {
      ...run('2026-10-05', '2026-10-05T04:17:30Z', Object.fromEntries(SOURCES_QUOTIDIENNES.map((c: string) => [c, c === 'denner-web' ? 'failed' : 'success']))),
      ran: SOURCES_QUOTIDIENNES,
    });
    const r = noter(etat, { systeme: 'github', declencheur: 'schedule', debut: '2026-10-05T04:17:00Z', code: 0, maintenant: new Date('2026-10-05T04:30:00Z') });
    expect(r.ok).toBe(false);
    suivi = readFileSync(join(etat, 'suivi', 'SUIVI.md'), 'utf8');
    expect(suivi).toContain('Premier déclenchement réel par la planification de GitHub (`schedule`) : 05.10.2026 à 06:17 → collecte');
    expect(suivi).toMatch(/\| 04\.10 \| aucun déclenchement \| ❌ aucun déclenchement \|/);
    expect(suivi).toContain('succès · 10 prix, 1 actions · données du 05.10 · contenu identique à la veille');
    expect(suivi).toContain('ÉCHEC · données conservées du 03.10 (anciennes)');
    expect(suivi).toContain('❌ denner-web ÉCHEC');
    // Reprise de Denner au créneau planifié suivant : les autres sources ne sont pas relues.
    ecrire(dossier('denner-web'), instantane('denner-web', '2026-10-05T07:50:00Z', 130));
    ecrire(join(etat, 'private', 'runs', 'latest.json'), {
      ...run('2026-10-05', '2026-10-05T07:47:30Z', Object.fromEntries(SOURCES_QUOTIDIENNES.map((c: string) => [c, 'success']))),
      ran: ['denner-web'],
    });
    const reprise = noter(etat, { systeme: 'github', declencheur: 'schedule', debut: '2026-10-05T07:47:00Z', code: 0, maintenant: new Date('2026-10-05T08:00:00Z') });
    expect(reprise.ok).toBe(true);
    expect(reprise.enregistrement.sources.filter((s: { lue: boolean }) => s.lue).map((s: { connector: string }) => s.connector)).toEqual(['denner-web']);
    suivi = readFileSync(join(etat, 'suivi', 'SUIVI.md'), 'utf8');
    expect(suivi).toContain('1/7');
    expect(suivi).toMatch(/\| 05\.10 \| .* \| ✅ \|/);
  });
});
