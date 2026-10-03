import { describe, expect, it } from 'vitest';
import { PoliteFetcher } from '../src/http/fetcher';
import { LidlWebConnector } from '../src/lidl';
import { silentLogger } from '../src/types';

/**
 * « Pages manquantes » (collecte Lidl partielle) : une erreur temporaire est relue une fois en fin de
 * collecte ; une page retirée par Lidl (404 / 410) est signalée sans rendre la collecte partielle ;
 * une page encore en erreur après la seconde passe la rend partielle, avec l'adresse en cause.
 */
const PASTA = 'https://sortiment.lidl.ch/fr/pasta-reis/pasta';
const MILCH = 'https://sortiment.lidl.ch/fr/milchprodukte-eier/milch';
const OFFRE = 'https://www.lidl.ch/c/fr-CH/fruits-et-legumes/a10001';
const SITEMAP = `<urlset><url><loc>${PASTA}</loc></url><url><loc>${MILCH}</loc></url></urlset>`;
const HOME = '<a href="/c/fr-CH/fruits-et-legumes/a10001">Fruits</a>';

type Reponse = { status: number; body?: string };

function collecte(comportement: (url: string, appel: number) => Reponse) {
  const appels = new Map<string, number>();
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    const n = (appels.get(url) ?? 0) + 1;
    appels.set(url, n);
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    if (url.endsWith('/sitemaps/fr.xml')) return new Response(SITEMAP, { status: 200, headers: { 'content-type': 'application/xml' } });
    if (url === 'https://www.lidl.ch/fr-CH/') return new Response(HOME, { status: 200, headers: { 'content-type': 'text/html' } });
    const r = comportement(url, n);
    return new Response(r.body ?? '<html></html>', { status: r.status, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
  const fetcher = new PoliteFetcher({ userAgent: 'TesPrixBot/0.1 (test)', fetchImpl, sleep: async () => {}, archiveDir: null, minDelayMs: 0 });
  const run = new LidlWebConnector().run({
    now: new Date('2026-10-04T04:20:00Z'),
    log: silentLogger,
    env: {},
    fetcher,
    targets: { needs: [], productUrls: [] },
  });
  return { run, appels };
}

describe('Lidl : pages manquantes', () => {
  it('erreur temporaire relue en fin de collecte, page retirée signalée : collecte complète', async () => {
    // PASTA : 504 pendant les 4 tentatives de la première passe, puis lue ; MILCH : retirée (404).
    const { run, appels } = collecte((url, n) => (url === PASTA ? (n <= 4 ? { status: 504 } : { status: 200 }) : url === MILCH ? { status: 404 } : { status: 200 }));
    const batch = await run;
    expect(batch.report.metrics).toMatchObject({ pageFailures: 0, pagesRemoved: 1, pagesRecovered: 1, assortmentPages: 1, offerPages: 1 });
    expect(batch.report.metrics?.pageFailureSample).toBeUndefined();
    expect(batch.report.warnings.map((w) => w.message)).toContain(`Page retirée par Lidl : ${MILCH} : HTTP 404 : ${MILCH}`);
    // Page retirée : jamais relue (une seule requête) ; erreur temporaire : 4 + 1 requêtes.
    expect(appels.get(MILCH)).toBe(1);
    expect(appels.get(PASTA)).toBe(5);
    expect(appels.get(OFFRE)).toBe(1);
  });

  it('erreur persistante après la seconde passe : collecte partielle, adresse indiquée', async () => {
    const { run, appels } = collecte((url) => (url === PASTA ? { status: 503 } : { status: 200 }));
    const batch = await run;
    expect(batch.report.metrics).toMatchObject({ pageFailures: 1, pagesRemoved: 0, pagesRecovered: 0 });
    expect(String(batch.report.metrics?.pageFailureSample)).toContain(PASTA);
    // 4 tentatives en première passe, 4 en seconde passe : pas davantage.
    expect(appels.get(PASTA)).toBe(8);
  });
});
