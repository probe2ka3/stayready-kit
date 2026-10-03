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
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Sous-dossiers de data/private conservés d'un jour à l'autre (ni cache HTTP, ni journaux, ni archives). */
export const DOSSIERS_PRIVES = ['live', 'runs', 'matrice', 'demo', 'matching'];
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

/** Collecte à faire ? Non si celle du jour (Zurich) a eu lieu sans source en échec technique. */
export function besoin(etat, { force = false, maintenant = new Date() } = {}) {
  const verrou = lireJson(join(etat, 'verrou.json'));
  if (verrou && maintenant.getTime() - Date.parse(verrou.debut) < VERROU_MINUTES * 60_000) {
    return { collecte: false, raison: `collecte en cours (${verrou.systeme}, depuis ${heure(verrou.debut)})` };
  }
  if (force) return { collecte: true, raison: 'relance forcée' };
  const run = lireJson(join(etat, 'private', 'runs', 'latest.json'));
  const aujourdhui = jourZurich(maintenant);
  if (!run || run.date !== aujourdhui) return { collecte: true, raison: `aucune collecte le ${aujourdhui}` };
  const echecs = (run.sources ?? []).filter((s) => s.status === 'failed').map((s) => s.connector);
  if (echecs.length) return { collecte: true, raison: `reprise des sources en échec : ${echecs.join(', ')}` };
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

/** Date des données conservées par source (instantanés de l'état), sans lire les prix. */
function donnees(etat) {
  const out = {};
  for (const dir of [join(etat, 'private', 'live'), join(etat, 'prices-live')]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const s = lireJson(join(dir, f));
      if (s?.connectorId) out[s.connectorId] = { collectedAt: s.collectedAt ?? null, status: s.status ?? null };
    }
  }
  return out;
}

/** Ajoute une exécution au journal de suivi et régénère SUIVI.md ; renvoie les échecs de cette exécution. */
export function noter(etat, { systeme, declencheur, debut, execution = null, code = null, issue = null, maintenant = new Date() }) {
  const run = lireJson(join(etat, 'private', 'runs', 'latest.json'));
  const collecte = Boolean(run?.startedAt && Date.parse(run.startedAt) >= Date.parse(debut) - 1000);
  const sources = collecte
    ? (run.sources ?? []).map((s) => ({ connector: s.connector, status: s.status, prices: s.prices ?? null, promotions: s.promotions ?? null, message: s.message ?? null }))
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
  const echecs = sources.filter((s) => s.status === 'failed' || s.status === 'blocked');
  const partiels = sources.filter((s) => s.status === 'partial');
  const codeEchec = enregistrement.code != null && enregistrement.code !== 0;
  return { enregistrement, echecs, partiels, ok: echecs.length === 0 && !codeEchec && enregistrement.issue !== 'echec' };
}

/** Exécutions enregistrées, dans l'ordre chronologique. */
export function lireJournal(etat) {
  const dir = join(etat, 'suivi', 'executions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => lireJson(join(dir, f)))
    .filter(Boolean)
    .sort((a, b) => a.debut.localeCompare(b.debut));
}

export function tableau(etat, maintenant = new Date()) {
  mkdirSync(join(etat, 'suivi'), { recursive: true });
  writeFileSync(join(etat, 'suivi', 'SUIVI.md'), suiviMarkdown(lireJournal(etat), maintenant));
}

/**
 * Bilan d'une journée : déclenchements, statut final de chaque source (dernière collecte du jour qui
 * l'a lue), date des données conservées en fin de journée, erreurs.
 */
export function bilanJour(enregistrements) {
  const statut = {};
  const message = {};
  for (const e of enregistrements) {
    for (const s of e.sources ?? []) {
      statut[s.connector] = s.status;
      message[s.connector] = s.message;
    }
  }
  const dernier = enregistrements[enregistrements.length - 1];
  const collecteur = enregistrements.find((e) => e.issue === 'collecte');
  const sourcesOk = SOURCES_QUOTIDIENNES.every((c) => ['success', 'partial'].includes(statut[c]));
  return {
    statut,
    message,
    donnees: dernier?.donnees ?? {},
    collectePar: collecteur ? `${collecteur.systeme} (${collecteur.declencheur})` : null,
    // Jour « bon » pour l'arrêt de Windows : collecte faite par GitHub sur déclenchement planifié,
    // et toutes les sources lues (succès ou partiel) en fin de journée.
    githubAutomatique: Boolean(enregistrements.some((e) => e.systeme === 'github' && e.declencheur === 'schedule' && e.issue === 'collecte')) && sourcesOk,
    sourcesOk,
  };
}

/** Jours consécutifs (jusqu'au dernier jour observé) où GitHub a collecté seul, automatiquement, sans échec. */
export function joursConsecutifs(journal) {
  const parJour = groupe(journal);
  const jours = [...parJour.keys()].sort();
  let n = 0;
  for (let i = jours.length - 1; i >= 0; i--) {
    if (!bilanJour(parJour.get(jours[i])).githubAutomatique) break;
    // Jours manquants dans le journal : aucune exécution, la série s'arrête.
    if (i < jours.length - 1 && Date.parse(jours[i + 1]) - Date.parse(jours[i]) > 86_400_000) break;
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

export function suiviMarkdown(journal, maintenant = new Date()) {
  const parJour = groupe(journal);
  const jours = [...parJour.keys()].sort().reverse().slice(0, 21);
  const n = joursConsecutifs(journal);
  const lignes = [
    '# Suivi de la collecte quotidienne',
    '',
    `Mis à jour le ${jourZurich(maintenant).split('-').reverse().join('.')} à ${heure(maintenant)} (heure de Zurich). Généré par \`etat.mjs\` ; une ligne par jour, les 21 derniers jours.`,
    '',
    `**Jours consécutifs où GitHub a collecté automatiquement, toutes sources lues : ${n}/7.** ${
      n >= 7 ? 'Période d’observation atteinte : l’arrêt de la tâche Windows peut être envisagé.' : 'Garder la tâche Windows.'
    }`,
    '',
    'Lecture : déclenchements = heure (Zurich), système, type (`schedule` = planifié par GitHub, `workflow_dispatch` = manuel, `push` = installation, `windows-tache` = tâche Windows) et issue (collecte, rien à faire, concurrence évitée, échec). Pour chaque source : statut final du jour et date des données conservées (une source en échec garde des données plus anciennes : leur date le montre).',
    '',
    `| Jour | Déclenchements | Collecte par | ${SOURCES_QUOTIDIENNES.join(' | ')} | Erreurs |`,
    `|---|---|---|${SOURCES_QUOTIDIENNES.map(() => '---').join('|')}|---|`,
  ];
  for (const jour of jours) {
    const es = parJour.get(jour);
    const b = bilanJour(es);
    const decl = es.map((e) => `${heure(e.debut)} ${e.systeme}/${e.declencheur} → ${e.issue}${e.execution ? ` ([exécution](${e.execution}))` : ''}`).join('<br>');
    const cellules = SOURCES_QUOTIDIENNES.map((c) => {
      const st = b.statut[c] ? STATUT[b.statut[c]] ?? b.statut[c] : '—';
      const d = b.donnees[c]?.collectedAt;
      return `${st}${d ? ` · données du ${jj(jourZurich(d))}` : ''}`;
    });
    const erreurs = Object.entries(b.message)
      .filter(([c, msg]) => msg && ['failed', 'blocked', 'partial'].includes(b.statut[c]))
      .map(([c, msg]) => `${c} : ${String(msg).replace(/\|/g, '/').slice(0, 160)}`)
      .concat(es.filter((e) => e.code != null && e.code !== 0).map((e) => `${e.systeme} : code de sortie ${e.code}`));
    lignes.push(`| ${jj(jour)} | ${decl} | ${b.collectePar ?? 'aucune'} | ${cellules.join(' | ')} | ${erreurs.join('<br>') || '—'} |`);
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
      for (const s of e.sources) console.log(`  ${s.connector.padEnd(12)} ${STATUT[s.status] ?? s.status}${s.message ? ` — ${s.message}` : ''}`);
      for (const s of r.echecs) if (github) console.log(`::error title=Source en échec : ${s.connector}::${STATUT[s.status]}${s.message ? ` — ${s.message}` : ''}`);
      for (const s of r.partiels) if (github) console.log(`::warning title=Source partielle : ${s.connector}::${s.message ?? 'pages manquantes'}`);
      if (github && e.code != null && e.code !== 0) console.log(`::error title=Collecte quotidienne::code de sortie ${e.code}`);
      if (process.env.GITHUB_STEP_SUMMARY) {
        const lignes = [`### Collecte du ${e.jour} : ${e.issue}`, '', '| Source | Statut | Prix | Actions |', '|---|---|---|---|', ...e.sources.map((s) => `| ${s.connector} | ${STATUT[s.status] ?? s.status} | ${s.prices ?? ''} | ${s.promotions ?? ''} |`), ''];
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
