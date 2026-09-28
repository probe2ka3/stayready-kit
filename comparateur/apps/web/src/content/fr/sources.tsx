import { formatLongDate } from '@cabas/core';
import { CHAINS } from '@cabas/reference';
import type { ChainStatus, CollectionInfo, PriceMode } from '@/server/data';
import { Prose } from '../prose';

const DAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Zurich' }).format(new Date(iso));
}

const COLLECTION_STATUS: Record<string, string> = {
  success: 'réussie',
  partial: 'partielle',
  failed: 'en échec',
  blocked: 'accès refusé par la source',
};

export function SourcesFr({
  status,
  backend,
  mode,
  collections,
}: {
  status: ChainStatus[];
  backend: string;
  mode: PriceMode;
  collections: CollectionInfo[];
}) {
  const byId = new Map(status.map((s) => [s.chainId, s]));
  return (
    <Prose>
      <h1>Sources des données</h1>
      <p className="lead">
        D’où viennent les prix, les promotions et les magasins, à quelle date ils ont été vérifiés, et ce qui reste à obtenir.
      </p>

      {mode === 'demo' ? (
        <p className="rounded-xl bg-demo-soft p-3 text-demo">
          <strong>Mode démonstration.</strong> Les prix et promotions affichés sont <strong>fictifs</strong>, générés pour faire fonctionner le
          comparateur. Les calendriers promotionnels et les succursales sont, eux, réels.
        </p>
      ) : (
        <p className="rounded-xl bg-primary-soft p-3">
          <strong>Prix réels uniquement.</strong> Aucune donnée fictive n’est mélangée aux prix affichés. La couverture est encore partielle :
          seule Lidl est collectée depuis son site officiel ; Migros, Coop, Denner, Aldi et OTTO’S ne sont couverts que par des relevés
          communautaires, moins nombreux et toujours signalés comme « indicatifs ». Action et Aligro n’ont pas de prix pour l’instant.
        </p>
      )}

      <h2>Collectes de prix réels</h2>
      {collections.length === 0 ? (
        <p>Aucune collecte n’a encore été effectuée.</p>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Dernière collecte</th>
                <th>État</th>
                <th>Articles</th>
                <th>Prix</th>
                <th>Promotions</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => (
                <tr key={c.connectorId}>
                  <td className="font-medium">
                    {c.label}
                    {c.license && <span className="block text-sm text-muted">Licence {c.license}</span>}
                  </td>
                  <td>{fmtDate(c.collectedAt)}</td>
                  <td>{COLLECTION_STATUS[c.status] ?? c.status}</td>
                  <td className="num">{c.products}</td>
                  <td className="num">{c.prices}</td>
                  <td className="num">{c.promotions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>État par enseigne</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Enseigne</th>
              <th>Succursales</th>
              <th>Articles</th>
              <th>Prix réels</th>
              <th>Dernière vérification</th>
              <th>Promotions en cours / annoncées</th>
            </tr>
          </thead>
          <tbody>
            {CHAINS.map((c) => {
              const s = byId.get(c.id);
              return (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td className="num">{s?.stores ?? 0}</td>
                  <td className="num">
                    {s?.products ?? 0}
                    {s && s.demoProducts > 0 ? ' (démo)' : ''}
                  </td>
                  <td className="num">{s?.realPrices ?? 0}</td>
                  <td>{fmtDate(s?.lastObservation ?? null)}</td>
                  <td className="num">
                    {s?.activePromotions ?? 0} / {s?.upcomingPromotions ?? 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">
        Stockage : {backend === 'postgres' ? 'base PostgreSQL' : 'instantanés en mémoire'} · données servies :{' '}
        {mode === 'live' ? 'prix réels' : 'démonstration'}.
      </p>

      <h2>Calendriers promotionnels constatés</h2>
      <p>
        Relevés sur les sources officielles lors de l’audit du 27 septembre 2026. Ils changent : Migros, Coop et Denner sont passés en 2025-2026
        d’un cycle mardi → lundi à un cycle jeudi → mercredi.
      </p>
      <table>
        <thead>
          <tr>
            <th>Enseigne</th>
            <th>Actions</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {CHAINS.map((c) => (
            <tr key={c.id}>
              <td className="font-medium">{c.name}</td>
              <td>
                {c.promoCalendar.waves
                  .map(
                    (w) =>
                      `${w.label} : dès le ${DAYS[w.startWeekday]}${w.durationDays ? `, ${w.durationDays} jours` : ', jusqu’à épuisement'}${
                        w.publishLeadDays ? ` (annoncées ${w.publishLeadDays} j avant)` : ''
                      }`,
                  )
                  .join(' · ')}
                {c.promoCalendar.notes && <span className="block text-sm text-muted">{c.promoCalendar.notes}</span>}
              </td>
              <td>
                <a href={c.promoCalendar.sourceUrl} target="_blank" rel="noopener noreferrer">
                  source
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Méthode de collecte</h2>
      <ol>
        <li>API ou flux officiels autorisés : aucun n’est publié par les enseignes à ce jour ;</li>
        <li>accords avec les enseignes : demandes à adresser ;</li>
        <li>
          pages publiques officielles, lorsque les conditions du site et son fichier robots.txt le permettent (aujourd’hui : Lidl). La
          collecte a lieu une fois par jour, au rythme d’une page toutes les 3 secondes au plus, avec un agent identifié. Seuls les faits sont
          conservés : désignation, format, prix, dates et numéro d’article ;
        </li>
        <li>données ouvertes : relevés communautaires Open Prices, avec ticket de caisse ou photo d’étiquette ;</li>
        <li>relevés documentés et import structuré de fichiers validés.</li>
      </ol>
      <p>
        Aucune protection technique n’est contournée. Les sites qui refusent l’accès automatisé (Migros, Coop, Aldi) ou l’interdisent dans leurs
        conditions (Denner) ne sont pas collectés. Les photos et logos des enseignes ne sont pas utilisés. Les prix en ligne ne sont jamais
        présentés comme des prix en magasin.
      </p>

      <h2>Données ouvertes et attributions</h2>
      <ul>
        <li>
          <strong>Localités et codes postaux</strong> : Source : Office fédéral de topographie swisstopo — Répertoire officiel des localités
          (données OGD, utilisation libre avec mention de la source).
        </li>
        <li>
          <strong>Prix communautaires</strong> : relevés{' '}
          <a href="https://prices.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
            Open Prices
          </a>{' '}
          (Open Food Facts), base de données sous licence{' '}
          <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">
            ODbL 1.0
          </a>
          . Chaque prix affiché indique la date et le lieu du relevé. Les données dérivées (prix normalisés et correspondances avec notre
          catalogue) sont disponibles sur demande sous la même licence.
        </li>
        <li>
          <strong>Succursales, adresses et horaires</strong> : © les contributeurs d’
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>
          , licence ODbL. La couverture est incomplète pour certaines enseignes récentes en Suisse (Action, Aligro) ; les horaires manquants sont
          signalés.
        </li>
      </ul>
      <p className="text-sm text-muted">Mise à jour de cette page : {formatLongDate(new Date().toISOString().slice(0, 10))}.</p>
    </Prose>
  );
}
