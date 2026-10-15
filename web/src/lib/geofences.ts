import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { haversine } from "./geo";
import type { Geofence } from "../types";

export function subscribeGeofences(
  deviceId: string,
  cb: (zones: Geofence[]) => void,
  onError?: (e: Error) => void
) {
  return onSnapshot(
    collection(db, "devices", deviceId, "geofences"),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Geofence)),
    (e) => onError?.(e)
  );
}

export function addGeofence(
  deviceId: string,
  zone: Omit<Geofence, "id">
): Promise<unknown> {
  return addDoc(collection(db, "devices", deviceId, "geofences"), zone);
}

export function deleteGeofence(deviceId: string, zoneId: string): Promise<void> {
  return deleteDoc(doc(db, "devices", deviceId, "geofences", zoneId));
}

export function isInside(zone: Geofence, lat: number, lng: number): boolean {
  return haversine(zone.lat, zone.lng, lat, lng) <= zone.radius;
}

/** Ask once for browser notification permission (no-op if unsupported). */
export function requestNotify(): void {
  if ("Notification" in window && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

export function notify(title: string, body: string): void {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}
