#!/usr/bin/env python3
"""Inventaire des données de sources à usage privé dans tout l'historique Git (toutes les références).

Usage (à la racine d'un clone, ou d'un miroir `git clone --mirror`) :
    python3 comparateur/ops/historique/inventaire.py <dossier-de-sortie>

Écrit dans <dossier-de-sortie> :
  - a-retirer.txt   versions de fichiers de données (data/) à retirer entièrement
                    (`git filter-repo --strip-blobs-with-ids`) ;
  - a-expurger.txt  versions de documents (rapports, guides) dont seuls les montants sont à masquer
                    (expurger.py, appelé par `git filter-repo --blob-callback`) ;
  - inventaire.md   détail lisible : fichier, version, premier et dernier commit, nombre de lignes.

Règles (les mêmes que comparateur/apps/worker/test/privacy.test.ts) :
  - JSON : montant (priceCents, promoPriceCents, referencePriceCents, totalCents) attribué à une source
    restreinte (étiquette, identifiant d'article privé ou URL d'un hôte privé) ;
  - autres fichiers de données : ligne avec un identifiant d'article privé ou une URL privée et un
    montant, ou ligne nommant Aldi, Denner ou le journal Coop avec un montant ;
  - documents : ligne nommant Aldi, Denner ou le journal Coop avec un montant, sauf lignes revues
    (privacy-docs-revues.txt : montant d'une autre enseigne, coût de trajet, tarif d'un service).
Rien n'est modifié : l'inventaire ne fait que lire.
"""
import collections
import json
import os
import re
import subprocess
import sys

RESTREINTES = {'aldi-api', 'denner-web', 'coop-epaper'}
ID_PRIVE = re.compile(r'\b(?:aldi|denner):\d+|\bcoop:ep-[0-9a-f]+')
MONTANT_DATA = re.compile(r'(?<![\d.])\d{1,4}\.\d{2}(?![\d.])')
HOTE_PRIVE = re.compile(r'https?://[^\s)"\'<>|\]]*(?:aldi-suisse\.ch|aldi\.ch|denner\.ch|cooperation\.ch|coopzeitung\.ch|cooperazione\.ch|coop\.ch|dam-coop-epaper)', re.I)
NOMME = re.compile(r'\b(Aldi|Denner|coop-epaper|journal Coop)\b', re.I)
MONTANT = re.compile(r'(?<![\d/])(?<!\d[.,])\d{1,4}[.,]\d{2}(?!\d|[.,]\d|/|%)')
NEUTRE = re.compile(r'\d+/\d+|CHF/mois|par mois|requêtes|\d+\s*(Mo|Ko|km|min|s)\b|\b\d{1,2}\.\d{2}\.20\d{2}\b|\b(0?[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\b(?!\s*CHF)|\b\d{1,2}:\d{2}\b|\b\d+\.\d+\.\d+')
EXTENSIONS = ('.json', '.md', '.csv', '.html', '.txt')


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True, check=True).stdout


def ligne_doc_signalee(ligne):
    if not NOMME.search(ligne) or re.search(r'EXEMPLE|fictif', ligne):
        return False
    return bool(MONTANT.search(NEUTRE.sub(' ', ligne)))


def json_prive(objet):
    n = 0
    pile = [objet]
    while pile:
        x = pile.pop()
        if isinstance(x, list):
            pile.extend(x)
        elif isinstance(x, dict):
            source = x.get('source') if isinstance(x.get('source'), dict) else {}
            proprietaire = x.get('connectorId') or source.get('connectorId')
            produit = isinstance(x.get('retailerProductId'), str) and ID_PRIVE.search(x['retailerProductId'])
            urls = [x.get('url'), x.get('sourceUrl'), source.get('ref')]
            url = any(isinstance(u, str) and HOTE_PRIVE.search(u) for u in urls)
            if proprietaire in RESTREINTES or produit or url:
                if any(isinstance(x.get(k), (int, float)) for k in ('priceCents', 'promoPriceCents', 'referencePriceCents', 'totalCents')):
                    n += 1
            pile.extend(x.values())
    return n


def main(sortie):
    os.makedirs(sortie, exist_ok=True)
    revues_path = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'worker', 'test', 'privacy-docs-revues.txt')
    revues = set()
    if os.path.exists(revues_path):
        revues = {l.split(' :: ', 1)[1].strip() for l in open(revues_path, encoding='utf8') if ' :: ' in l and not l.startswith('#')}
    versions = collections.defaultdict(lambda: {'chemins': set(), 'commits': []})
    commits = git('rev-list', '--all', '--reverse', '--date-order').split()
    for c in commits:
        for ligne in git('ls-tree', '-r', c).splitlines():
            meta, chemin = ligne.split('\t', 1)
            _, type_, blob = meta.split()
            # La liste des lignes revues cite ces lignes : elle n'est pas un document à expurger.
            if type_ == 'blob' and chemin.startswith('comparateur/') and chemin.endswith(EXTENSIONS) and not chemin.endswith('privacy-docs-revues.txt'):
                v = versions[blob]
                v['chemins'].add(chemin)
                v['commits'].append(c)
    retirer, expurger = {}, {}
    for blob, v in versions.items():
        chemin = sorted(v['chemins'])[0]
        texte = subprocess.run(['git', 'cat-file', '-p', blob], capture_output=True).stdout.decode('utf8', 'replace')
        donnees = '/data/' in chemin and '/data/imports/examples/' not in chemin
        if donnees and chemin.endswith('.json'):
            try:
                n = json_prive(json.loads(texte))
            except ValueError:
                n = 0
            if n:
                retirer[blob] = (chemin, n, v)
        elif donnees:
            n = sum(1 for l in texte.split('\n') if ((ID_PRIVE.search(l) or HOTE_PRIVE.search(l)) and MONTANT_DATA.search(l)) or ligne_doc_signalee(l))
            if n:
                retirer[blob] = (chemin, n, v)
        else:
            n = sum(1 for l in texte.split('\n') if ligne_doc_signalee(l) and l.strip() not in revues)
            if n:
                expurger[blob] = (chemin, n, v)
    open(os.path.join(sortie, 'a-retirer.txt'), 'w').write(''.join(f'{b}\n' for b in sorted(retirer)))
    open(os.path.join(sortie, 'a-expurger.txt'), 'w').write(''.join(f'{b}\n' for b in sorted(expurger)))
    court = lambda c: c[:7]
    lignes = [
        '# Inventaire des données de sources à usage privé dans l’historique',
        '',
        f'{len(commits)} commits examinés (toutes les références : {", ".join(r for r in git("for-each-ref", "--format=%(refname:short)").split())}).',
        '',
        '| Action | Fichier | Version (blob) | Premier commit | Dernier commit | Lignes ou montants |',
        '|---|---|---|---|---|---|',
    ]
    for action, table in (('retirer', retirer), ('expurger', expurger)):
        for blob, (chemin, n, v) in sorted(table.items(), key=lambda x: (x[1][0], commits.index(x[1][2]['commits'][0]))):
            lignes.append(f'| {action} | `{chemin}` | `{blob[:10]}` | `{court(v["commits"][0])}` | `{court(v["commits"][-1])}` | {n} |')
    open(os.path.join(sortie, 'inventaire.md'), 'w', encoding='utf8').write('\n'.join(lignes) + '\n')
    print(f'{len(retirer)} version(s) à retirer, {len(expurger)} version(s) de documents à expurger ; détail : {sortie}/inventaire.md')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'nettoyage')
