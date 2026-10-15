import type { LocationPoint, Stop } from "../types";

/** Great-circle distance between two lat/lng points, in metres. */
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Total path length of an ordered list of points, in metres. */
export function pathDistance(points: LocationPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return total;
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Metres/second -> km/h string. */
export function formatSpeed(mps?: number): string {
  if (mps == null || mps <= 0) return "—";
  return `${(mps * 3.6).toFixed(1)} km/h`;
}

export function formatAltitude(m?: number): string {
  if (m == null || m === 0) return "—";
  return `${Math.round(m)} m`;
}

/**
 * Stop detection: walk the ordered points and group consecutive ones that stay
 * within `radiusM` of the group's anchor; a group spanning at least `minMs`
 * becomes a "stop" (a place the device lingered).
 */
export function detectStops(
  points: LocationPoint[],
  radiusM = 70,
  minMs = 5 * 60 * 1000
): Stop[] {
  const stops: Stop[] = [];
  let i = 0;
  while (i < points.length) {
    let j = i;
    while (
      j + 1 < points.length &&
      haversine(points[i].lat, points[i].lng, points[j + 1].lat, points[j + 1].lng) <= radiusM
    ) {
      j++;
    }
    const durationMs = points[j].timestamp - points[i].timestamp;
    if (j > i && durationMs >= minMs) {
      let sLat = 0;
      let sLng = 0;
      for (let k = i; k <= j; k++) {
        sLat += points[k].lat;
        sLng += points[k].lng;
      }
      const n = j - i + 1;
      stops.push({
        lat: sLat / n,
        lng: sLng / n,
        start: points[i].timestamp,
        end: points[j].timestamp,
        durationMs,
      });
      i = j + 1;
    } else {
      i++;
    }
  }
  return stops;
}

/** Time-range presets for the history view. */
export interface RangeOption {
  key: string;
  label: string;
  ms: number;
}

export const RANGES: RangeOption[] = [
  { key: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { key: "6h", label: "Last 6 hours", ms: 6 * 60 * 60 * 1000 },
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
];
