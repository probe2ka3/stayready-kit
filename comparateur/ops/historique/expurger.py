# Corps de rappel pour `git filter-repo --blob-callback` (voir docs/NETTOYAGE_HISTORIQUE.md) :
#   git filter-repo --blob-callback "$(cat comparateur/ops/historique/expurger.py)"
# avec la variable d'environnement TESPRIX_A_EXPURGER = chemin de a-expurger.txt (inventaire.py).
#
# Seules les versions de documents listées sont modifiées : sur chaque ligne qui nomme Aldi, Denner ou
# le journal Coop avec un montant, les montants sont remplacés par « [montant retiré] » (dates, heures,
# distances, durées et rapports « n/m » conservés). Le reste du document est inchangé.
import os
import re

etat = globals().setdefault('_tesprix', {})
if 'ids' not in etat:
    etat['ids'] = {l.strip().encode() for l in open(os.environ['TESPRIX_A_EXPURGER']) if l.strip()}
    etat['nomme'] = re.compile(r'\b(Aldi|Denner|coop-epaper|journal Coop)\b', re.I)
    etat['montant'] = re.compile(r'(?<![\d/])(?<!\d[.,])\d{1,4}[.,]\d{2}(?!\d|[.,]\d|/|%)')
    etat['neutre'] = re.compile(r'\d+/\d+|CHF/mois|par mois|requêtes|\d+\s*(Mo|Ko|km|min|s)\b|\b\d{1,2}\.\d{2}\.20\d{2}\b|\b(0?[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\b(?!\s*CHF)|\b\d{1,2}:\d{2}\b|\b\d+\.\d+\.\d+')
if blob.original_id in etat['ids']:
    sortie = []
    for ligne in blob.data.decode('utf8', 'replace').split('\n'):
        if etat['nomme'].search(ligne) and not re.search(r'EXEMPLE|fictif', ligne):
            neutres = [m.span() for m in etat['neutre'].finditer(ligne)]
            def remplace(m, neutres=neutres):
                if any(a <= m.start() < b for a, b in neutres):
                    return m.group(0)
                return '[montant retiré]'
            ligne = etat['montant'].sub(remplace, ligne)
        sortie.append(ligne)
    blob.data = '\n'.join(sortie).encode('utf8')
