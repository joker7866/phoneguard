package com.phoneguard.app.data

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.provider.Settings
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import com.phoneguard.app.data.model.CommandStatus
import com.phoneguard.app.data.model.LocationPoint
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeviceRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore
) {
    val uid: String? get() = auth.currentUser?.uid
    val isLoggedIn: Boolean get() = auth.currentUser != null

    val deviceId: String by lazy { readAndroidId() }

    @SuppressLint("HardwareIds")
    private fun readAndroidId(): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "unknown-device"

    private fun deviceRef() = db.collection("devices").document(deviceId)

    suspend fun signIn(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
    }

    fun signOut() = auth.signOut()

    /** Create or refresh the device document owned by the current user. */
    suspend fun registerDevice(battery: Int) {
        val owner = uid ?: return
        val data = mapOf<String, Any>(
            "ownerUid" to owner,
            "name" to (Build.MODEL ?: "My phone"),
            "model" to "${Build.MANUFACTURER} ${Build.MODEL}",
            "battery" to battery,
            "lastSeen" to FieldValue.serverTimestamp()
        )
        deviceRef().set(data, SetOptions.merge()).await()
    }

    /**
     * Live query of commands still waiting to run for this device. The command
     * listener service watches this and executes each one, which is how the web
     * dashboard controls the phone without any server component.
     */
    fun pendingCommandsQuery(): Query? {
        uid ?: return null
        return deviceRef().collection("commands")
            .whereEqualTo("status", CommandStatus.PENDING)
    }

    /** Recent owner-sent notifications for this device (newest first). */
    fun notificationsQuery(): Query? {
        uid ?: return null
        return deviceRef().collection("notifications")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(50)
    }

    /** Mark a notification shown so it isn't surfaced again. */
    suspend fun markNotificationDelivered(id: String) {
        deviceRef().collection("notifications").document(id)
            .set(mapOf("delivered" to true), SetOptions.merge()).await()
    }

    /** Push a new location point and update the live fields on the device doc. */
    suspend fun uploadLocation(point: LocationPoint) {
        val owner = uid ?: return
        deviceRef().set(
            mapOf(
                "ownerUid" to owner,
                "lat" to point.lat,
                "lng" to point.lng,
                "accuracy" to point.accuracy,
                "speed" to point.speed,
                "altitude" to point.altitude,
                "battery" to point.battery,
                "lastSeen" to FieldValue.serverTimestamp()
            ),
            SetOptions.merge()
        ).await()
        deviceRef().collection("locations").add(point).await()
    }

    suspend fun setTracking(on: Boolean) {
        deviceRef().set(mapOf("tracking" to on), SetOptions.merge()).await()
    }

    suspend fun markCommand(commandId: String, status: String, error: String? = null) {
        val update = mutableMapOf<String, Any>(
            "status" to status,
            "handledAt" to FieldValue.serverTimestamp()
        )
        if (error != null) update["error"] = error
        deviceRef().collection("commands").document(commandId)
            .set(update, SetOptions.merge()).await()
    }
}
