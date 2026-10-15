import type { Timestamp } from "firebase/firestore";

export interface Device {
  id: string;
  ownerUid: string;
  name?: string;
  label?: string; // family member / person label set by the owner
  model?: string;
  battery?: number;
  lat?: number;
  lng?: number;
  accuracy?: number;
  speed?: number;
  altitude?: number;
  tracking?: boolean;
  lastSeen?: Timestamp;
}

export interface LocationPoint {
  id: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed?: number;
  altitude?: number;
  battery: number;
  timestamp: number;
}

/** A circular zone the owner watches for enter/exit alerts. */
export interface Geofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // metres
}

/** A detected place the device stayed put for a while. */
export interface Stop {
  lat: number;
  lng: number;
  start: number;
  end: number;
  durationMs: number;
}

export const CommandType = {
  LOCATE: "LOCATE",
  START_TRACKING: "START_TRACKING",
  STOP_TRACKING: "STOP_TRACKING",
  RING: "RING",
  STOP_RING: "STOP_RING",
  LOCK: "LOCK",
} as const;

export type CommandTypeValue = (typeof CommandType)[keyof typeof CommandType];
