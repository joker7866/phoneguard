package com.phoneguard.app.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import com.phoneguard.app.MainActivity
import com.phoneguard.app.PhoneGuardApp
import com.phoneguard.app.R
import com.phoneguard.app.data.DeviceRepository
import com.phoneguard.app.data.model.LocationPoint
import com.phoneguard.app.util.BatteryUtil
import com.phoneguard.app.util.Prefs
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class LocationService : Service() {

    @Inject lateinit var repo: DeviceRepository

    private lateinit var client: FusedLocationProviderClient
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var callback: LocationCallback? = null

    override fun onCreate() {
        super.onCreate()
        client = LocationServices.getFusedLocationProviderClient(this)
        startForegroundSafely()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val tracking = Prefs.get(this).tracking
        when (intent?.action) {
            ACTION_LOCATE_ONCE -> requestSingle()
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
            else -> requestUpdates(tracking)
        }
        return START_STICKY
    }

    private fun intervalMs(tracking: Boolean) = if (tracking) 15_000L else 5 * 60_000L

    @SuppressLint("MissingPermission")
    private fun requestUpdates(tracking: Boolean) {
        callback?.let { client.removeLocationUpdates(it) }
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY, intervalMs(tracking)
        ).setMinUpdateIntervalMillis(intervalMs(tracking) / 2).build()

        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { upload(it) }
            }
        }
        callback = cb
        client.requestLocationUpdates(request, cb, mainLooper)
    }

    @SuppressLint("MissingPermission")
    private fun requestSingle() {
        client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { loc -> if (loc != null) upload(loc) }
    }

    private fun upload(loc: Location) {
        val point = LocationPoint(
            lat = loc.latitude,
            lng = loc.longitude,
            accuracy = loc.accuracy,
            speed = if (loc.hasSpeed()) loc.speed else 0f,
            altitude = if (loc.hasAltitude()) loc.altitude else 0.0,
            battery = BatteryUtil.level(this),
            timestamp = System.currentTimeMillis()
        )
        scope.launch { runCatching { repo.uploadLocation(point) } }
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(1, notif)
        }
    }

    override fun onDestroy() {
        callback?.let { client.removeLocationUpdates(it) }
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_LOCATE_ONCE = "locate_once"
        const val ACTION_STOP = "stop"

        fun start(context: Context, action: String? = null) {
            val i = Intent(context, LocationService::class.java)
            if (action != null) i.action = action
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                context.startForegroundService(i)
            else context.startService(i)
        }
    }
}
