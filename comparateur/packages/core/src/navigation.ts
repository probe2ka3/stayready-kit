import type { LatLon } from './types';
import type { TravelMode } from './travel';

/**
 * Liens d'ouverture de l'itinéraire dans une application de navigation.
 * Aucun appel serveur n'est fait : les coordonnées ne sont transmises au service
 * choisi que lorsque l'utilisateur clique sur le lien.
 */

const GOOGLE_MODE: Record<TravelMode, string> = {
  car: 'driving',
  bike: 'bicycling',
  foot: 'walking',
  transit: 'transit',
};

const APPLE_MODE: Record<TravelMode, string> = { car: 'd', bike: 'c', foot: 'w', transit: 'r' };

const fmt = (p: LatLon) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

/** Itinéraire complet (Google Maps accepte des étapes intermédiaires, sauf en transports publics). */
export function googleMapsRoute(origin: LatLon, stops: LatLon[], mode: TravelMode, returnToOrigin: boolean): string {
  const points = returnToOrigin ? [...stops, origin] : [...stops];
  const destination = points[points.length - 1] ?? origin;
  const waypoints = points.slice(0, -1);
  const params = new URLSearchParams({
    api: '1',
    origin: fmt(origin),
    destination: fmt(destination),
    travelmode: GOOGLE_MODE[mode],
  });
  if (waypoints.length > 0 && mode !== 'transit') params.set('waypoints', waypoints.map(fmt).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Trajet simple vers une étape (Apple Plans ne gère qu'une destination par lien). */
export function appleMapsLeg(from: LatLon, to: LatLon, mode: TravelMode): string {
  const params = new URLSearchParams({ saddr: fmt(from), daddr: fmt(to), dirflg: APPLE_MODE[mode] });
  return `https://maps.apple.com/?${params.toString()}`;
}

/** URI « geo: » (Android, applications de navigation hors ligne comme OsmAnd). */
export function geoUri(p: LatLon, label: string): string {
  return `geo:${fmt(p)}?q=${fmt(p)}(${encodeURIComponent(label)})`;
}

/** Itinéraire OpenStreetMap entre deux points. */
export function osmLeg(from: LatLon, to: LatLon, mode: TravelMode): string {
  const engine = mode === 'foot' ? 'fossgis_osrm_foot' : mode === 'bike' ? 'fossgis_osrm_bike' : 'fossgis_osrm_car';
  return `https://www.openstreetmap.org/directions?engine=${engine}&route=${encodeURIComponent(`${fmt(from)};${fmt(to)}`)}`;
}
