import Link from 'next/link';
import { paths } from '@/i18n';
import { Prose, Todo } from '../prose';

/**
 * Textes juridiques. Les éléments marqués « à compléter » dépendent de
 * l'exploitant et de l'hébergement : ils doivent être renseignés avant la mise
 * en ligne publique (voir docs/audit/02-juridique.md).
 */

export function AboutFr() {
  return (
    <Prose>
      <h1>À propos</h1>
      <p className="lead">Un comparateur de courses indépendant pour la Suisse : trouver où faire ses courses au meilleur coût, trajet compris.</p>
      <h2>Indépendance</h2>
      <p>
        Ce service est un <strong>comparateur indépendant, sans affiliation avec les enseignes citées</strong> (Migros, Coop, Denner, Aldi
        Suisse, Lidl Suisse, OTTO’S, Action, Aligro). Aucune enseigne ne paie pour être mieux classée. Si un partenariat était conclu, il serait
        indiqué clairement. Les noms des enseignes servent uniquement à désigner leurs magasins ; leurs marques appartiennent à leurs titulaires.
      </p>
      <h2>Ce qui fonctionne aujourd’hui</h2>
      <ul>
        <li>Recherche des succursales réelles autour d’un code postal (données OpenStreetMap et swisstopo).</li>
        <li>Panier sans compte, conservé dans votre navigateur.</li>
        <li>Comparaison en trois scénarios, itinéraire, listes par magasin, planification selon les promotions annoncées.</li>
      </ul>
      <h2>Ce qui dépend encore d’autorisations</h2>
      <ul>
        <li>
          Les <strong>prix réels</strong> : en l’absence d’interface officielle et d’accord, les prix affichés sont fictifs (mode démonstration).
          Voir <Link href={paths.sources('fr')}>Sources</Link>.
        </li>
        <li>Les calculs d’itinéraire routier précis (service d’itinéraire à héberger).</li>
      </ul>
      <p>
        Le détail des calculs est publié sur la page <Link href={paths.method('fr')}>Méthode</Link>.
      </p>
      <p className="text-sm text-muted">« Cabas » est un nom de travail, sous réserve d’une recherche d’antériorité de marque.</p>
    </Prose>
  );
}

export function PrivacyFr() {
  return (
    <Prose>
      <h1>Politique de confidentialité</h1>
      <p className="lead">
        Ce comparateur fonctionne sans compte et collecte le minimum de données personnelles (loi fédérale sur la protection des données, LPD).
      </p>
      <h2>Responsable du traitement</h2>
      <p>
        <Todo>À compléter : nom ou raison sociale, adresse postale, adresse électronique de contact.</Todo>
      </p>
      <h2>Données traitées et finalités</h2>
      <table>
        <thead>
          <tr>
            <th>Donnée</th>
            <th>Finalité</th>
            <th>Conservation</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Code postal ou localité choisie ; position du navigateur si vous l’autorisez (arrondie au mètre)</td>
            <td>Trouver les magasins proches et calculer l’itinéraire</td>
            <td>Traitée le temps du calcul, non enregistrée sur le serveur. Conservée dans votre navigateur jusqu’à ce que vous la modifiiez.</td>
          </tr>
          <tr>
            <td>Panier, favoris, préférences, listes de courses</td>
            <td>Faire fonctionner le comparateur</td>
            <td>Uniquement dans votre navigateur (stockage local). Envoyés au serveur pour le calcul, sans y être enregistrés.</td>
          </tr>
          <tr>
            <td>Journaux techniques (date, route appelée, durée, erreurs)</td>
            <td>Sécurité et bon fonctionnement</td>
            <td>Sans adresse IP ni position ni contenu du panier. <Todo>Durée à fixer (recommandé : 30 jours)</Todo>.</td>
          </tr>
          <tr>
            <td>Empreinte non réversible et temporaire de l’adresse IP</td>
            <td>Limiter les abus (nombre de requêtes)</td>
            <td>En mémoire vive uniquement, quelques minutes.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Aucun cookie publicitaire, aucun outil de mesure d’audience et aucun traceur tiers ne sont utilisés. Seule l’administration utilise un cookie
        de session strictement nécessaire.
      </p>
      <h2>Destinataires et transferts</h2>
      <ul>
        <li>
          Hébergeur du service : <Todo>à compléter (préférence : hébergement en Suisse ou dans l’UE)</Todo>.
        </li>
        <li>Service d’itinéraire, s’il est configuré : coordonnées des points de passage uniquement.</li>
        <li>
          Lorsque vous ouvrez un itinéraire dans Google Maps ou Apple Plans, les coordonnées sont transmises à ce service à votre initiative ; ses
          propres règles de confidentialité s’appliquent.
        </li>
      </ul>
      <h2>Vos droits</h2>
      <p>
        Vous pouvez demander l’accès à vos données, leur rectification ou leur effacement (LPD art. 25 et suivants). Comme aucune donnée
        personnelle n’est enregistrée sur nos serveurs, vous gardez le contrôle : effacer les données du site dans votre navigateur supprime
        panier, favoris et listes. Vous pouvez saisir une plainte auprès du Préposé fédéral à la protection des données et à la transparence
        (PFPDT).
      </p>
      <p className="text-sm text-muted">Version du 27 septembre 2026.</p>
    </Prose>
  );
}

export function ImprintFr() {
  return (
    <Prose>
      <h1>Mentions légales</h1>
      <h2>Exploitant</h2>
      <p>
        <Todo>À compléter : nom ou raison sociale, forme juridique, adresse, adresse électronique, numéro IDE le cas échéant.</Todo>
      </p>
      <h2>Indépendance et marques</h2>
      <p>
        Comparateur indépendant, sans affiliation avec les enseignes citées. Les marques et noms commerciaux mentionnés appartiennent à leurs
        titulaires et ne sont utilisés que pour désigner leurs magasins et produits. Aucun logo ni aucune photographie des enseignes n’est reproduit.
      </p>
      <h2>Exactitude des informations</h2>
      <p>
        Les prix, promotions, horaires et disponibilités peuvent changer. Chaque prix indique sa source et sa date de vérification ; le prix
        applicable est celui affiché en magasin. En mode démonstration, les prix sont fictifs.
      </p>
      <h2>Données</h2>
      <ul>
        <li>Localités : Source : Office fédéral de topographie swisstopo.</li>
        <li>Succursales : © les contributeurs d’OpenStreetMap, base de données sous licence ODbL.</li>
      </ul>
    </Prose>
  );
}
