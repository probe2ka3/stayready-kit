import { formatLongDate } from '@cabas/core';
import { CHAINS } from '@cabas/reference';
import type { ChainStatus } from '@/server/data';
import { Prose } from '../prose';

const DAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Zurich' }).format(new Date(iso));
}

export function SourcesFr({ status, backend, realPrices }: { status: ChainStatus[]; backend: string; realPrices: boolean }) {
  const byId = new Map(status.map((s) => [s.chainId, s]));
  return (
    <Prose>
      <h1>Sources des données</h1>
      <p className="lead">
        D’où viennent les prix, les promotions et les magasins, à quelle date ils ont été vérifiés, et ce qui reste à obtenir.
      </p>

      {!realPrices && (
        <p className="rounded-xl bg-demo-soft p-3 text-demo">
          <strong>Mode démonstration.</strong> Aucune enseigne ne publie aujourd’hui d’interface officielle de ses prix, et aucun accord n’est
          encore conclu. Les prix et promotions affichés sont <strong>fictifs</strong>, générés pour faire fonctionner le comparateur. Les
          calendriers promotionnels (jours de début, durées, délais de publication) et les succursales sont, eux, réels.
        </p>
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
      <p className="text-sm text-muted">Stockage des données : {backend === 'postgres' ? 'base PostgreSQL' : 'mode démonstration en mémoire'}.</p>

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
        <li>API ou flux officiels autorisés — aucun n’est publié par les enseignes à ce jour ;</li>
        <li>accords avec les enseignes — demandes à adresser ;</li>
        <li>relevés manuels documentés (source, date, portée) ;</li>
        <li>import structuré de fichiers validés.</li>
      </ol>
      <p>
        Aucune protection technique des sites des enseignes n’est contournée, et aucune collecte automatisée de leurs sites n’est effectuée sans
        autorisation. Les photos et logos des enseignes ne sont pas utilisés.
      </p>

      <h2>Données ouvertes et attributions</h2>
      <ul>
        <li>
          <strong>Localités et codes postaux</strong> : Source : Office fédéral de topographie swisstopo — Répertoire officiel des localités
          (données OGD, utilisation libre avec mention de la source).
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
