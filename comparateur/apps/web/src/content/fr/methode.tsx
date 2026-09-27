import { DEFAULT_COST_PER_KM, DEFAULT_FRESHNESS, HARD_MAX_STORES, MAX_PLAN_DAYS, PRESUMED_HOURS_TEXT, STORES_PER_PROFILE } from '@cabas/core';
import { JsonLd } from '@/components/json-ld';
import { Prose } from '../prose';

export const METHOD_FAQ = [
  {
    q: 'Comment l’économie est-elle calculée ?',
    a: 'Économie = coût des articles comparables dans la référence − coût des mêmes articles dans le scénario proposé, moins le surcoût de trajet éventuel. La référence est votre magasin habituel si vous l’indiquez, sinon le meilleur magasin unique. Les articles introuvables dans l’un des deux scénarios sont exclus du calcul.',
  },
  {
    q: 'Les prix sont-ils garantis ?',
    a: 'Non. Chaque prix indique sa source et sa date de vérification. Un prix pour une date future est le dernier prix connu, sans garantie, sauf si une promotion a déjà été annoncée par l’enseigne. La disponibilité en succursale n’est jamais garantie.',
  },
  {
    q: 'Pourquoi le comparateur ne propose-t-il pas toujours le prix le plus bas ?',
    a: 'Le scénario « coût global optimisé » tient compte du trajet, du temps et du nombre de magasins : un détour qui ne fait économiser que quelques centimes n’est pas proposé. Le scénario « prix le plus bas » reste affiché pour comparaison.',
  },
];

export function MethodFr() {
  return (
    <Prose>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: METHOD_FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
        }}
      />
      <h1>Méthode de comparaison</h1>
      <p className="lead">
        Le comparateur cherche la combinaison de magasins qui vous permet de faire vos courses au meilleur coût, en tenant compte des prix,
        des promotions, des distances et de vos préférences. Cette page décrit exactement comment.
      </p>

      <h2>1. Comparer des produits équivalents</h2>
      <p>
        Les enseignes ne vendent pas les mêmes articles sous le même nom. Le comparateur s’appuie sur un <strong>catalogue normalisé</strong>{' '}
        de références standard (par exemple « farine blanche, 1 kg ») auxquelles sont rattachés les articles de chaque enseigne.
      </p>
      <ul>
        <li>
          <strong>Code EAN/GTIN identique</strong> : même produit.
        </li>
        <li>
          <strong>Équivalent</strong> : même type, mêmes caractéristiques essentielles (bio, origine suisse, AOP, sans lactose…), quantité à ±10 %.
        </li>
        <li>
          <strong>Conditionnement différent</strong> : même produit dans un autre format ; le nombre de paquets nécessaires est calculé (2 × 500 g
          pour 1 kg) et le prix au kilo ou au litre est affiché. Vous pouvez refuser ces substitutions.
        </li>
      </ul>
      <p>
        Deux produits aux caractéristiques différentes ne sont jamais considérés comme équivalents. Les correspondances proposées
        automatiquement ne sont utilisées qu’après validation humaine. Lorsqu’une marque est imposée (par exemple une pâte à tartiner de marque),
        seuls les articles de cette marque sont retenus.
      </p>

      <h2>2. Trois scénarios</h2>
      <table>
        <thead>
          <tr>
            <th>Scénario</th>
            <th>Ce qui est minimisé</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Un seul magasin</td>
            <td>Le coût du panier complet dans une seule succursale (atteignable et ouverte).</td>
          </tr>
          <tr>
            <td>Prix le plus bas</td>
            <td>
              Le coût des produits, en répartissant les articles entre plusieurs magasins dans la limite choisie. Le trajet sert seulement à départager
              deux solutions au même prix ; il est néanmoins affiché.
            </td>
          </tr>
          <tr>
            <td>Coût global optimisé</td>
            <td>
              Produits + coût des trajets + temps valorisé (si vous le souhaitez), avec un seuil d’économie minimale par magasin supplémentaire.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Dans chaque scénario, le panier le plus complet possible est privilégié : une solution qui trouve plus d’articles passe avant une solution
        moins chère mais incomplète. Les articles introuvables sont listés séparément.
      </p>

      <h2>3. Le calcul du trajet</h2>
      <ul>
        <li>L’itinéraire complet est calculé : départ, chaque magasin, puis retour (désactivable).</li>
        <li>
          Coût kilométrique par défaut : CHF {DEFAULT_COST_PER_KM.car.toFixed(2)} en voiture (coûts variables : carburant, usure), CHF 0 à pied
          ou à vélo, CHF {DEFAULT_COST_PER_KM.transit.toFixed(2)} par km en transports publics (estimation grossière). Vous pouvez le modifier.
        </li>
        <li>
          Le temps passé en magasin est affiché séparément ; il n’est valorisé en francs que si vous le demandez explicitement.
        </li>
        <li>
          Sans service d’itinéraire configuré, distances et durées sont <strong>estimées</strong> (distance à vol d’oiseau × facteur de détour,
          vitesse moyenne selon le mode) et signalées comme telles.
        </li>
        <li>
          Les horaires d’ouverture sont vérifiés à l’heure d’arrivée estimée : une succursale fermée n’est jamais proposée. Pour une succursale
          sans horaires connus, des horaires usuels sont présumés (<code>{PRESUMED_HOURS_TEXT}</code>) : hors de ces plages elle est exclue, dans ces
          plages elle est signalée « horaires non vérifiés ». Les jours fériés cantonaux rendent les horaires incertains.
        </li>
      </ul>

      <h2>4. L’algorithme d’optimisation</h2>
      <p>
        Le problème — choisir à la fois les magasins, la répartition des articles et l’ordre de visite — est connu sous le nom de « problème du
        voyageur acheteur ». Il est difficile dans le cas général ; le comparateur exploite une propriété du commerce suisse pour le résoudre
        exactement dans les cas courants :
      </p>
      <ol>
        <li>
          Les succursales qui partagent exactement les mêmes prix (même enseigne, même zone tarifaire) sont regroupées en <em>profils de prix</em> :
          visiter deux succursales du même profil n’apporte rien.
        </li>
        <li>
          Toutes les combinaisons de profils jusqu’au nombre maximal de magasins (au plus {HARD_MAX_STORES}) sont évaluées ; celles où un magasin
          n’apporte aucun article moins cher sont écartées, et une borne inférieure (achats + aller-retour vers le magasin le plus éloigné) élimine
          les combinaisons qui ne peuvent pas battre la meilleure solution trouvée.
        </li>
        <li>
          Pour chaque combinaison retenue, un calcul exact (programmation dynamique de Held-Karp généralisée) choisit la succursale de chaque profil
          et l’ordre de visite, en respectant les horaires. Les {STORES_PER_PROFILE} succursales ouvertes les plus proches de chaque profil sont
          considérées.
        </li>
      </ol>
      <p>
        Cette méthode est vérifiée par des tests automatisés qui comparent ses résultats à une recherche exhaustive sur des dizaines de cas
        aléatoires.
      </p>

      <h2>5. Promotions et dates</h2>
      <ul>
        <li>
          Une promotion a une <strong>date de publication</strong> et une <strong>période de validité</strong>, distinctes : certaines enseignes
          annoncent leurs actions plusieurs jours ou semaines à l’avance. Une promotion n’est appliquée que si elle est publiée et valable à la date
          des courses (fuseau Europe/Zurich).
        </li>
        <li>
          En mode « planifier » (jusqu’à {MAX_PLAN_DAYS} jours), seules les promotions déjà annoncées sont prises en compte ; pour les autres
          articles, le dernier prix connu est utilisé avec la mention « non garanti ». Aucun prix futur n’est inventé.
        </li>
        <li>
          Les promotions réservées à une carte ou une application (Cumulus, Supercard, Lidl Plus…) ne s’appliquent que si vous indiquez en disposer.
        </li>
        <li>Les promotions sont souvent valables « jusqu’à épuisement du stock » : c’est indiqué, sans garantie de disponibilité.</li>
        <li>Les promotions ne sont pas cumulées : la plus avantageuse s’applique.</li>
      </ul>

      <h2>6. Fiabilité de chaque prix</h2>
      <table>
        <thead>
          <tr>
            <th>Statut</th>
            <th>Signification</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Prix vérifié</td>
            <td>Vérifié il y a {DEFAULT_FRESHNESS.verifiedMaxAgeDays} jours au plus.</td>
          </tr>
          <tr>
            <td>Promotion confirmée</td>
            <td>Publiée par la source et valable à la date des courses.</td>
          </tr>
          <tr>
            <td>Prix indicatif</td>
            <td>
              Vérifié il y a plus de {DEFAULT_FRESHNESS.verifiedMaxAgeDays} jours, ou dernier prix connu utilisé pour une date future.
            </td>
          </tr>
          <tr>
            <td>Prix périmé</td>
            <td>Plus de {DEFAULT_FRESHNESS.staleAfterDays} jours : exclu du calcul par défaut, dernier prix connu affiché à titre informatif.</td>
          </tr>
          <tr>
            <td>Démo</td>
            <td>Donnée fictive de démonstration.</td>
          </tr>
        </tbody>
      </table>
      <p>La disponibilité en succursale n’est jamais affirmée : le comparateur ne dispose pas de données de stock.</p>

      <h2>7. Économies annoncées</h2>
      <p>
        <strong>Économie</strong> = coût des articles comparables dans la référence − coût des mêmes articles dans le scénario, moins le surcoût
        de trajet éventuel. La référence est votre magasin habituel si vous l’indiquez, sinon le meilleur magasin unique. Les articles
        introuvables dans l’un des deux scénarios sont exclus, et la différence de couverture est indiquée. Si un scénario coûte plus cher que la
        référence, le surcoût est affiché tel quel.
      </p>
      <p>
        Le comparateur n’affiche pas de prix barré de sa propre initiative : un prix « au lieu de » ne provient que de l’enseigne. Aucune promesse
        d’économie générale (« jusqu’à X % ») n’est faite.
      </p>

      <h2>8. Limites connues</h2>
      <ul>
        <li>Les prix régionaux (coopératives Migros) sont rattachés par canton, approximation des limites réelles.</li>
        <li>Les promotions portant sur plusieurs articles différents ou sur le montant total du panier ne sont pas encore gérées.</li>
        <li>Au-delà de {HARD_MAX_STORES} magasins, la recherche est plafonnée (le gain devient négligeable face au trajet).</li>
        <li>Les estimations de trajet en transports publics sont grossières : consultez l’horaire officiel.</li>
      </ul>

      <h2>Questions fréquentes</h2>
      {METHOD_FAQ.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}
    </Prose>
  );
}
