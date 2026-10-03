#!/usr/bin/env node
/**
 * État partagé de la collecte quotidienne (dépôt privé `tesprix-collecte`, dossier `etat/`), commun à
 * GitHub Actions et à la tâche Windows : un seul journal, donc une seule collecte par jour de Zurich,
 * quel que soit le système qui la fait. Node.js seul (aucune dépendance) : utilisable sur un serveur
 * GitHub comme sur l'ordinateur de l'exploitant.
 *
 *   node etat.mjs besoin <etat> [--force]          collecte=oui|non et raison (format GITHUB_OUTPUT)
 *   node etat.mjs verrou <etat> --systeme <nom>    0 : verrou pris ; 3 : collecte en cours ailleurs
 *   node etat.mjs liberer <etat>
 *   node etat.mjs restaurer <etat> <data>          état → dossier data du code
 *   node etat.mjs enregistrer <data> <etat>        dossier data → état (sans archives brutes ni cache)
 *   node etat.mjs noter <etat> --systeme <nom> --declencheur <type> --debut <ISO>
 *                       [--execution <url>] [--code <n>] [--issue rien|concurrence|echec]
 *        Journal de suivi : un fichier par exécution (etat/suivi/executions/, jamais en conflit entre
 *        deux systèmes) et tableau etat/suivi/SUIVI.md ; code 1 si une source a échoué pendant cette
 *        exécution : un workflow « vert » ne masque jamais une source en panne.
 *   node etat.mjs tableau <etat>                   régénère SUIVI.md (après une fusion)
 *
 * Données privées : l'état ne quitte jamais le dépôt privé ; le suivi ne contient ni prix ni article.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Sous-dossiers de data/private conservés d'un jour à l'autre (ni cache HTTP, ni journaux, ni archives). */
export const DOSSIERS_PRIVES = ['live', 'runs', 'matrice', 'demo', 'matching', 'releves'];
/** Sources à usage privé : jamais dans le dossier des instantanés publiables (contrôlé par un test). */
export const SOURCES_PRIVEES = ['aldi-api', 'denner-web', 'coop-epaper'];
export const SOURCES_QUOTIDIENNES = ['open-prices', 'coop-epaper', 'denner-web', 'aldi-api', 'lidl-web'];
/** Un verrou plus ancien est considéré comme abandonné (exécution interrompue). */
export const VERROU_MINUTES = 120;
/** Déclencheurs qui prouvent une exécution automatique (pas un lancement manuel). */
export const AUTOMATIQUES = ['schedule', 'windows-tache'];

const zurich = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' });
const heureZurich = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' });
export const jourZurich = (d) => zurich.format(new Date(d));
const heure = (d) => heureZurich.format(new Date(d));
const jj = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

function lireJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function copierDossier(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const nom of readdirSync(src)) {
    const a = join(src, nom);
    const b = join(dst, nom);
    if (statSync(a).isDirectory()) copierDossier(a, b);
    else copyFileSync(a, b);
  }
}

/**
 * Collecte à faire ? Non si celle du jour (Zurich) a eu lieu sans source en échec technique ni
 * incomplète ; sinon seules ces sources sont reprises (une source bloquée ne l'est jamais le même jour).
 */
export function besoin(etat, { force = false, maintenant = new Date() } = {}) {
  const verrou = lireJson(join(etat, 'verrou.json'));
  if (verrou && maintenant.getTime() - Date.parse(verrou.debut) < VERROU_MINUTES * 60_000) {
    return { collecte: false, raison: `collecte en cours (${verrou.systeme}, depuis ${heure(verrou.debut)})` };
  }
  if (force) return { collecte: true, raison: 'relance forcée' };
  const run = lireJson(join(etat, 'private', 'runs', 'latest.json'));
  const aujourdhui = jourZurich(maintenant);
  if (!run || run.date !== aujourdhui) return { collecte: true, raison: `aucune collecte le ${aujourdhui}` };
  const echecs = (run.sources ?? []).filter((s) => s.status === 'failed' || s.status === 'partial').map((s) => s.connector);
  if (echecs.length) return { collecte: true, raison: `reprise des sources en échec ou incomplètes : ${echecs.join(', ')}` };
  return { collecte: false, raison: `collecte du ${aujourdhui} déjà faite (${heure(run.startedAt)})` };
}

export function prendreVerrou(etat, systeme, { maintenant = new Date(), execution = null } = {}) {
  const path = join(etat, 'verrou.json');
  const verrou = lireJson(path);
  if (verrou && maintenant.getTime() - Date.parse(verrou.debut) < VERROU_MINUTES * 60_000) return false;
  mkdirSync(etat, { recursive: true });
  writeFileSync(path, `${JSON.stringify({ systeme, debut: maintenant.toISOString(), execution }, null, 1)}\n`);
  return true;
}

export function libererVerrou(etat) {
  rmSync(join(etat, 'verrou.json'), { force: true });
}

const collecteeLe = (path) => lireJson(path)?.collectedAt ?? null;

/** État → dossier data : privé intégralement ; publiable seulement s'il est plus récent que celui du code. */
export function restaurer(etat, data) {
  for (const d of DOSSIERS_PRIVES) {
    const src = join(etat, 'private', d);
    if (!existsSync(src)) continue;
    rmSync(join(data, 'private', d), { recursive: true, force: true });
    copierDossier(src, join(data, 'private', d));
  }
  rmSync(join(data, 'private', 'runs', 'quotidien.lock'), { force: true });
  const pub = join(etat, 'prices-live');
  if (!existsSync(pub)) return;
  mkdirSync(join(data, 'prices', 'live'), { recursive: true });
  for (const f of readdirSync(pub).filter((x) => x.endsWith('.json'))) {
    if (SOURCES_PRIVEES.includes(f.replace(/\.json$/, ''))) continue;
    const cible = join(data, 'prices', 'live', f);
    const a = collecteeLe(join(pub, f));
    const b = existsSync(cible) ? collecteeLe(cible) : null;
    if (a && (!b || a > b)) copyFileSync(join(pub, f), cible);
  }
}

/** Dossier data → état (aucune archive brute, aucun cache, jamais le verrou de `quotidien`). */
export function enregistrer(data, etat) {
  for (const d of DOSSIERS_PRIVES) {
    rmSync(join(etat, 'private', d), { recursive: true, force: true });
    const src = join(data, 'private', d);
    if (existsSync(src)) copierDossier(src, join(etat, 'private', d));
  }
  rmSync(join(etat, 'private', 'runs', 'quotidien.lock'), { force: true });
  const pub = join(etat, 'prices-live');
  rmSync(pub, { recursive: true, force: true });
  mkdirSync(pub, { recursive: true });
  const live = join(data, 'prices', 'live');
  if (!existsSync(live)) return;
  for (const f of readdirSync(live).filter((x) => x.endsWith('.json'))) {
    if (!SOURCES_PRIVEES.includes(f.replace(/\.json$/, ''))) copyFileSync(join(live, f), join(pub, f));
  }
}

/**
 * Empreinte du contenu d'un instantané : prix et actions (article, montant, type, validité, zone),
 * sans horodatage ni identifiant daté. Deux lectures réussies d'un contenu identique (journal Coop
 * entre deux éditions, assortiment inchangé) ont la même empreinte : « contenu identique à la veille »
 * est alors normal, et se distingue d'un échec (données conservées d'un jour antérieur).
 */
export function empreinte(snapshot) {
  const b = snapshot?.batch;
  if (!b) return null;
  const prix = (b.prices ?? []).map((p) => [p.retailerProductId, p.priceCents, p.priceType, p.zoneId ?? '', p.storeId ?? ''].join('|'));
  const actions = (b.promotions ?? []).map((p) =>
    [p.retailerProductId, p.promoPriceCents, p.referencePriceCents, p.percent, p.buyQty, p.type, p.validFrom, p.validTo, p.zoneId ?? '', p.storeId ?? ''].join('|'),
  );
  return createHash('sha256').update([...prix.sort(), '#', ...actions.sort()].join('\n')).digest('hex').slice(0, 16);
}

/** Date et empreinte des données conservées par source (instantanés de l'état) ; aucun prix n'en sort. */
function donnees(etat) {
  const out = {};
  for (const dir of [join(etat, 'private', 'live'), join(etat, 'prices-live')]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const s = lireJson(join(dir, f));
      if (s?.connectorId) out[s.connectorId] = { collectedAt: s.collectedAt ?? null, status: s.status ?? null, empreinte: empreinte(s) };
    }
  }
  return out;
}

/** Ajoute une exécution au journal de suivi et régénère SUIVI.md ; renvoie les échecs de cette exécution. */
export function noter(etat, { systeme, declencheur, debut, execution = null, code = null, issue = null, maintenant = new Date() }) {
  const run = lireJson(join(etat, 'private', 'runs', 'latest.json'));
  const collecte = Boolean(run?.startedAt && Date.parse(run.startedAt) >= Date.parse(debut) - 1000);
  // `ran` : sources lues par cette exécution ; les autres ne font que reporter leur résultat du jour.
  const lues = collecte && Array.isArray(run.ran) ? new Set(run.ran) : null;
  const sources = collecte
    ? (run.sources ?? []).map((s) => ({
        connector: s.connector,
        status: s.status,
        lue: lues ? lues.has(s.connector) : true,
        prices: s.prices ?? null,
        promotions: s.promotions ?? null,
        requests: s.requests ?? null,
        message: s.message ?? null,
      }))
    : [];
  const enregistrement = {
    jour: jourZurich(debut),
    debut,
    fin: maintenant.toISOString(),
    systeme,
    declencheur,
    execution,
    issue: issue ?? (collecte ? 'collecte' : 'rien'),
    code: code == null || code === '' ? null : Number(code),
    collecte: collecte ? { date: run.date, startedAt: run.startedAt, finishedAt: run.finishedAt } : null,
    sources,
    donnees: donnees(etat),
  };
  const dir = join(etat, 'suivi', 'executions');
  mkdirSync(dir, { recursive: true });
  // Un fichier par exécution (suffixe aléatoire : deux exécutions dans la même seconde ne s'écrasent pas).
  const suffixe = Math.random().toString(16).slice(2, 8);
  writeFileSync(join(dir, `${debut.replace(/[:.]/g, '-')}-${systeme}-${suffixe}.json`), `${JSON.stringify(enregistrement, null, 1)}\n`);
  tableau(etat, maintenant);
  const luesIci = sources.filter((s) => s.lue);
  const echecs = luesIci.filter((s) => s.status === 'failed' || s.status === 'blocked');
  const partiels = luesIci.filter((s) => s.status === 'partial');
  const codeEchec = enregistrement.code != null && enregistrement.code !== 0;
  return { enregistrement, echecs, partiels, ok: echecs.length === 0 && !codeEchec && enregistrement.issue !== 'echec' };
}

/**
 * Exécutions enregistrées, dans l'ordre chronologique : début (à la seconde), puis fin (à la
 * milliseconde) pour départager deux exécutions commencées dans la même seconde.
 */
export function lireJournal(etat) {
  const dir = join(etat, 'suivi', 'executions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => lireJson(join(dir, f)))
    .filter(Boolean)
    .sort((a, b) => a.debut.localeCompare(b.debut) || String(a.fin ?? '').localeCompare(String(b.fin ?? '')));
}

export function tableau(etat, maintenant = new Date()) {
  mkdirSync(join(etat, 'suivi'), { recursive: true });
  writeFileSync(join(etat, 'suivi', 'SUIVI.md'), suiviMarkdown(lireJournal(etat), maintenant));
}

const planifiee = (e) => e.systeme === 'github' && e.declencheur === 'schedule';
const lue = (s) => s.lue !== false;

/**
 * Bilan d'une journée : déclenchements, statut final de chaque source (dernière exécution du jour qui
 * l'a lue), volumes, date des données conservées en fin de journée, erreurs, et verdict « jour
 * complet » : chaque source lue en SUCCÈS par un déclenchement planifié de GitHub (`schedule`). Un
 * lancement manuel, une installation (`push`), une collecte Windows ou une exécution « rien à faire »
 * ne valident pas une journée ; une source partielle non plus.
 */
export function bilanJour(enregistrements) {
  const statut = {};
  const message = {};
  const volume = {};
  const parPlanification = {};
  for (const e of enregistrements) {
    for (const s of (e.sources ?? []).filter(lue)) {
      statut[s.connector] = s.status;
      message[s.connector] = s.message;
      volume[s.connector] = { prices: s.prices ?? null, promotions: s.promotions ?? null };
      if (planifiee(e)) parPlanification[s.connector] = s.status;
    }
  }
  const dernier = enregistrements[enregistrements.length - 1];
  const collecteur = enregistrements.find((e) => e.issue === 'collecte');
  const declenchementPlanifie = enregistrements.some(planifiee);
  const manquantes = SOURCES_QUOTIDIENNES.filter((c) => parPlanification[c] !== 'success');
  const githubAutomatique = declenchementPlanifie && manquantes.length === 0;
  let pourquoi = null;
  if (!githubAutomatique) {
    if (!declenchementPlanifie) pourquoi = 'aucun déclenchement planifié par GitHub';
    else if (!enregistrements.some((e) => planifiee(e) && e.issue === 'collecte')) pourquoi = 'déclenchement planifié sans collecte';
    else pourquoi = manquantes.map((c) => `${c} ${parPlanification[c] ? STATUT[parPlanification[c]] ?? parPlanification[c] : 'non lu par GitHub planifié'}`).join(', ');
  }
  return {
    statut,
    message,
    volume,
    donnees: dernier?.donnees ?? {},
    collectePar: collecteur ? `${collecteur.systeme} (${collecteur.declencheur})` : null,
    declenchementPlanifie,
    githubAutomatique,
    pourquoi,
  };
}

const jourSuivant = (iso) => new Date(Date.parse(`${iso}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Jours consécutifs (jusqu'au dernier jour observé) complets selon `bilanJour` ; un jour sans exécution rompt la série. */
export function joursConsecutifs(journal) {
  const parJour = groupe(journal);
  const jours = [...parJour.keys()].sort();
  let n = 0;
  for (let i = jours.length - 1; i >= 0; i--) {
    if (!bilanJour(parJour.get(jours[i])).githubAutomatique) break;
    if (i < jours.length - 1 && jourSuivant(jours[i]) !== jours[i + 1]) break;
    n++;
  }
  return n;
}

function groupe(journal) {
  const m = new Map();
  for (const e of journal) {
    if (!m.has(e.jour)) m.set(e.jour, []);
    m.get(e.jour).push(e);
  }
  return m;
}

const STATUT = { success: 'succès', partial: 'partiel', failed: 'ÉCHEC', blocked: 'BLOQUÉ', disabled: 'désactivé' };
const dateFr = (iso) => iso.split('-').reverse().join('.');

function volumeTexte(v) {
  if (!v) return '';
  const parts = [];
  if (v.prices) parts.push(`${v.prices} prix`);
  if (v.promotions) parts.push(`${v.promotions} actions`);
  return parts.length ? parts.join(', ') : '0 article';
}

/** Jalons distincts : premier cycle manuel, premier déclenchement planifié, série de jours complets. */
function jalons(journal) {
  const manuel = journal.find(
    (e) => ['push', 'workflow_dispatch'].includes(e.declencheur) && e.issue === 'collecte' && SOURCES_QUOTIDIENNES.every((c) => e.sources?.some((s) => s.connector === c && lue(s) && s.status === 'success')),
  );
  const planifie = journal.find(planifiee);
  const lien = (e) => (e.execution ? ` ([exécution](${e.execution}))` : '');
  return [
    `- Premier cycle manuel (installation ou lancement manuel) avec les 5 sources en succès : ${
      manuel ? `${dateFr(manuel.jour)} à ${heure(manuel.debut)} (${manuel.declencheur})${lien(manuel)}` : 'pas encore'
    }`,
    `- Premier déclenchement réel par la planification de GitHub (\`schedule\`) : ${
      planifie ? `${dateFr(planifie.jour)} à ${heure(planifie.debut)} → ${planifie.issue}${lien(planifie)}` : '**pas encore observé**'
    }`,
  ];
}

export function suiviMarkdown(journal, maintenant = new Date()) {
  const parJour = groupe(journal);
  const observes = [...parJour.keys()].sort();
  // Jours sans aucune exécution entre le premier et le dernier jour observés : affichés comme tels.
  const tous = [];
  for (let d = observes[0]; d && d <= observes[observes.length - 1]; d = jourSuivant(d)) tous.push(d);
  const jours = tous.reverse().slice(0, 21);
  const n = joursConsecutifs(journal);
  const lignes = [
    '# Suivi de la collecte quotidienne',
    '',
    `Mis à jour le ${dateFr(jourZurich(maintenant))} à ${heure(maintenant)} (heure de Zurich), à chaque exécution (GitHub ou tâche Windows en mode partagé), par \`etat.mjs\`. Une date ancienne ici signifie qu’aucune exécution n’a eu lieu depuis.`,
    '',
    ...jalons(journal),
    `- **Jours consécutifs complets (collecte planifiée par GitHub, 5 sources en succès) : ${n}/7.** ${
      n >= 7 ? 'Période d’observation atteinte : l’arrêt de la tâche Windows peut être envisagé.' : 'Garder la tâche Windows.'
    }`,
    '',
    'Lecture. Déclenchements : heure (Zurich), système, type (`schedule` = planifié par GitHub, `workflow_dispatch` = manuel, `push` = installation, `windows-tache` / `windows-manuel` = Windows) et issue (collecte, rien = déjà faite, concurrence = verrou tenu par l’autre système, echec). Sources : statut final du jour, volume lu, date des données conservées. « contenu identique à la veille » : lecture réussie sans nouvelle offre (normal, par exemple journal Coop entre deux éditions). « anciennes » : aucune lecture réussie ce jour-là, les données d’un jour antérieur sont conservées et ne comptent pas comme une collecte du jour. Une source partielle ou un jour sans déclenchement planifié ne compte pas pour 7/7.',
    '',
    `| Jour | Déclenchements | Compte pour 7/7 | ${SOURCES_QUOTIDIENNES.join(' | ')} | Erreurs |`,
    `|---|---|---|${SOURCES_QUOTIDIENNES.map(() => '---').join('|')}|---|`,
  ];
  let veille = null;
  const empreintesParJour = new Map(observes.map((j) => [j, bilanJour(parJour.get(j)).donnees]));
  for (const jour of jours) {
    const es = parJour.get(jour);
    if (!es) {
      lignes.push(`| ${jj(jour)} | aucun déclenchement | ❌ aucun déclenchement | ${SOURCES_QUOTIDIENNES.map(() => '—').join(' | ')} | — |`);
      continue;
    }
    const b = bilanJour(es);
    const precedent = observes.filter((j) => j < jour).pop();
    veille = precedent ? empreintesParJour.get(precedent) : null;
    const decl = es.map((e) => `${heure(e.debut)} ${e.systeme}/${e.declencheur} → ${e.issue}${e.execution ? ` ([exécution](${e.execution}))` : ''}`).join('<br>');
    const cellules = SOURCES_QUOTIDIENNES.map((c) => {
      const st = b.statut[c] ? STATUT[b.statut[c]] ?? b.statut[c] : '—';
      const d = b.donnees[c]?.collectedAt;
      const dJour = d ? jourZurich(d) : null;
      const parts = [st];
      if (b.statut[c] && ['success', 'partial'].includes(b.statut[c])) parts.push(volumeTexte(b.volume[c]));
      if (dJour && dJour < jour) parts.push(`données conservées du ${jj(dJour)} (anciennes)`);
      else if (dJour) parts.push(`données du ${jj(dJour)}`);
      const e = b.donnees[c]?.empreinte;
      if (dJour === jour && e && veille?.[c]?.empreinte === e) parts.push('contenu identique à la veille');
      return parts.filter(Boolean).join(' · ');
    });
    const erreurs = Object.entries(b.message)
      .filter(([c, msg]) => msg && ['failed', 'blocked', 'partial'].includes(b.statut[c]))
      .map(([c, msg]) => `${c} : ${String(msg).replace(/\|/g, '/').slice(0, 160)}`)
      .concat(es.filter((e) => e.code != null && e.code !== 0).map((e) => `${e.systeme} : code de sortie ${e.code}`));
    const compte = b.githubAutomatique ? '✅' : `❌ ${b.pourquoi}`;
    lignes.push(`| ${jj(jour)} | ${decl} | ${compte} | ${cellules.join(' | ')} | ${erreurs.join('<br>') || '—'} |`);
  }
  return `${lignes.join('\n')}\n`;
}

// --- Ligne de commande ------------------------------------------------------------------------
function options(args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) o[k] = v;
      else if (args[i + 1] && !args[i + 1].startsWith('--')) o[k] = args[++i];
      else o[k] = true;
    } else o._.push(a);
  }
  return o;
}

function main(argv) {
  const [commande, ...reste] = argv;
  const o = options(reste);
  const github = Boolean(process.env.GITHUB_ACTIONS);
  switch (commande) {
    case 'besoin': {
      const r = besoin(o._[0], { force: o.force === true || o.force === 'true' });
      process.stdout.write(`collecte=${r.collecte ? 'oui' : 'non'}\nraison=${r.raison}\n`);
      return 0;
    }
    case 'verrou':
      return prendreVerrou(o._[0], o.systeme ?? 'inconnu', { execution: o.execution ?? null }) ? 0 : 3;
    case 'tableau':
      tableau(o._[0]);
      return 0;
    case 'liberer':
      libererVerrou(o._[0]);
      return 0;
    case 'restaurer':
      restaurer(o._[0], o._[1]);
      return 0;
    case 'enregistrer':
      enregistrer(o._[0], o._[1]);
      return 0;
    case 'noter': {
      const r = noter(o._[0], { systeme: o.systeme, declencheur: o.declencheur, debut: o.debut, execution: o.execution ?? null, code: o.code ?? null, issue: o.issue ?? null });
      const e = r.enregistrement;
      console.log(`Suivi : ${e.jour}, ${e.systeme}/${e.declencheur} → ${e.issue}${e.code != null ? ` (code ${e.code})` : ''}`);
      for (const s of e.sources) {
        const detail = s.lue ? `${STATUT[s.status] ?? s.status} (${volumeTexte({ prices: s.prices, promotions: s.promotions })}, ${s.requests ?? '?'} requêtes)` : `non relue (résultat du jour : ${STATUT[s.status] ?? s.status})`;
        console.log(`  ${s.connector.padEnd(12)} ${detail}${s.lue && s.message ? ` — ${s.message}` : ''}`);
      }
      for (const s of r.echecs) if (github) console.log(`::error title=Source en échec : ${s.connector}::${STATUT[s.status]}${s.message ? ` — ${s.message}` : ''}`);
      for (const s of r.partiels) if (github) console.log(`::warning title=Source incomplète : ${s.connector}::${s.message ?? 'collecte incomplète'} (ne compte pas pour 7/7 ; reprise au créneau suivant)`);
      if (github && e.code != null && e.code !== 0) console.log(`::error title=Collecte quotidienne::code de sortie ${e.code}`);
      if (process.env.GITHUB_STEP_SUMMARY) {
        const lignes = [
          `### Collecte du ${e.jour} : ${e.issue}`,
          '',
          '| Source | Lue par cette exécution | Statut | Prix | Actions | Requêtes |',
          '|---|---|---|---|---|---|',
          ...e.sources.map((s) => `| ${s.connector} | ${s.lue ? 'oui' : 'non (résultat du jour)'} | ${STATUT[s.status] ?? s.status} | ${s.prices ?? ''} | ${s.promotions ?? ''} | ${s.lue ? s.requests ?? '' : ''} |`),
          '',
        ];
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lignes.join('\n')}\n`);
      }
      return r.ok ? 0 : 1;
    }
    default:
      console.error('Usage : node etat.mjs besoin|verrou|liberer|restaurer|enregistrer|noter|tableau …');
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
