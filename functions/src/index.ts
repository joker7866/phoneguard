/**
 * PhoneGuard Cloud Functions.
 *
 * The trusted middle layer between the web dashboard and the phone. The
 * dashboard never talks to the device directly: it calls `sendCommand`,
 * which verifies the caller owns the device, records the command in
 * Firestore, and wakes the phone with an FCM data message. The phone
 * executes it and writes the result back to the same command document.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

initializeApp();
const db = getFirestore();

/** Command types the phone knows how to execute. Must match the Android CommandType. */
const COMMAND_TYPES = [
  "LOCATE",
  "START_TRACKING",
  "STOP_TRACKING",
  "RING",
  "STOP_RING",
  "LOCK",
] as const;
type CommandType = (typeof COMMAND_TYPES)[number];

interface SendCommandData {
  deviceId?: string;
  type?: string;
}

/**
 * Callable: queue a command for one of the caller's devices and push it to
 * the phone. Returns the new command id so the dashboard can watch its status.
 */
export const sendCommand = onCall<SendCommandData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to send commands.");
  }

  const deviceId = request.data.deviceId;
  const type = request.data.type as CommandType | undefined;

  if (!deviceId) {
    throw new HttpsError("invalid-argument", "deviceId is required.");
  }
  if (!type || !COMMAND_TYPES.includes(type)) {
    throw new HttpsError("invalid-argument", `Unknown command type: ${type}`);
  }

  const deviceRef = db.collection("devices").doc(deviceId);
  const deviceSnap = await deviceRef.get();
  if (!deviceSnap.exists) {
    throw new HttpsError("not-found", "Device not found.");
  }

  const device = deviceSnap.data() as { ownerUid?: string; fcmToken?: string };
  if (device.ownerUid !== uid) {
    throw new HttpsError("permission-denied", "You do not own this device.");
  }
  if (!device.fcmToken) {
    throw new HttpsError(
      "failed-precondition",
      "This device has not registered for push messages yet."
    );
  }

  // Record the command first so the phone (and the dashboard) have a durable
  // record even if the push is delayed.
  const commandRef = deviceRef.collection("commands").doc();
  await commandRef.set({
    type,
    status: "pending",
    issuedBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  try {
    await getMessaging().send({
      token: device.fcmToken,
      data: { commandId: commandRef.id, type },
      android: { priority: "high" },
    });
  } catch (err) {
    logger.error("FCM send failed", { deviceId, type, err });
    await commandRef.set(
      { status: "failed", error: "push_delivery_failed" },
      { merge: true }
    );
    throw new HttpsError("unavailable", "Could not reach the device.");
  }

  logger.info("Command dispatched", { deviceId, type, commandId: commandRef.id });
  return { commandId: commandRef.id };
});
