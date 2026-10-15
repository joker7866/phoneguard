package com.phoneguard.app.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.ListenerRegistration
import com.phoneguard.app.MainActivity
import com.phoneguard.app.PhoneGuardApp
import com.phoneguard.app.R
import com.phoneguard.app.command.CommandExecutor
import com.phoneguard.app.data.DeviceRepository
import com.phoneguard.app.data.model.CommandStatus
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.Collections
import javax.inject.Inject

/**
 * Keeps a live Firestore listener on this device's pending commands and runs
 * each one via [CommandExecutor]. This replaces the Cloud Function + FCM path,
 * so the whole system works on Firebase's free Spark plan: the web dashboard
 * writes a command document, and this service reacts to it in real time.
 */
@AndroidEntryPoint
class CommandListenerService : Service() {

    @Inject lateinit var repo: DeviceRepository
    @Inject lateinit var auth: FirebaseAuth

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var registration: ListenerRegistration? = null
    private var notifReg: ListenerRegistration? = null

    // Commands already handed to the executor, so a MODIFIED snapshot (e.g. the
    // "done" write we make) never re-runs them.
    private val inFlight = Collections.synchronizedSet(mutableSetOf<String>())
    private val postedNotifs = Collections.synchronizedSet(mutableSetOf<String>())
    private var nextNotifId = 1000

    // The signed-in user may not be restored yet when the OS (re)starts this
    // service. Re-attach the listener the moment auth becomes available.
    private val authListener = FirebaseAuth.AuthStateListener {
        if (it.currentUser != null && registration == null) listen()
    }

    override fun onCreate() {
        super.onCreate()
        startForegroundSafely()
        auth.addAuthStateListener(authListener)
        listen()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (registration == null) listen()
        return START_STICKY
    }

    private fun listen() {
        // Null when the user isn't restored yet; the auth listener retries later.
        val query = repo.pendingCommandsQuery() ?: return
        registration?.remove()
        registration = query.addSnapshotListener { snapshot, error ->
            if (error != null || snapshot == null) return@addSnapshotListener
            for (doc in snapshot.documents) {
                val status = doc.getString("status")
                val type = doc.getString("type") ?: continue
                if (status != CommandStatus.PENDING) continue
                val id = doc.id
                if (!inFlight.add(id)) continue
                scope.launch {
                    runCatching { CommandExecutor(applicationContext, repo).run(id, type) }
                    inFlight.remove(id)
                }
            }
        }

        // Also watch owner-sent notifications and show them to the user.
        notifReg?.remove()
        notifReg = repo.notificationsQuery()?.addSnapshotListener { snapshot, error ->
            if (error != null || snapshot == null) return@addSnapshotListener
            for (doc in snapshot.documents) {
                if (doc.getBoolean("delivered") == true) continue
                val id = doc.id
                if (!postedNotifs.add(id)) continue
                val title = doc.getString("title") ?: getString(R.string.app_name)
                val body = doc.getString("body") ?: ""
                postMessage(title, body)
                scope.launch { runCatching { repo.markNotificationDelivered(id) } }
            }
        }
    }

    private fun postMessage(title: String, body: String) {
        val tap = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(this, PhoneGuardApp.MESSAGE_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(R.drawable.ic_shield)
            .setAutoCancel(true)
            .setContentIntent(tap)
            .build()
        runCatching { NotificationManagerCompat.from(this).notify(nextNotifId++, n) }
    }

    private fun startForegroundSafely() {
        val tapIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        val notif: Notification = NotificationCompat.Builder(this, PhoneGuardApp.CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notif_text))
            .setSmallIcon(R.drawable.ic_shield)
            .setOngoing(true)
            .setContentIntent(tapIntent)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(2, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(2, notif)
        }
    }

    override fun onDestroy() {
        auth.removeAuthStateListener(authListener)
        registration?.remove()
        notifReg?.remove()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        fun start(context: Context) {
            val i = Intent(context, CommandListenerService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                context.startForegroundService(i)
            else context.startService(i)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, CommandListenerService::class.java))
        }
    }
}
