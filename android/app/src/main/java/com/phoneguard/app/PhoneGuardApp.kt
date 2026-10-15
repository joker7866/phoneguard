package com.phoneguard.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class PhoneGuardApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java)
            val protection = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notif_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply { setShowBadge(false) }
            val messages = NotificationChannel(
                MESSAGE_CHANNEL_ID,
                getString(R.string.notif_message_channel_name),
                NotificationManager.IMPORTANCE_HIGH
            )
            mgr.createNotificationChannel(protection)
            mgr.createNotificationChannel(messages)
        }
    }

    companion object {
        const val CHANNEL_ID = "phoneguard_protection"
        const val MESSAGE_CHANNEL_ID = "phoneguard_messages"
    }
}
