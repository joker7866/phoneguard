package com.phoneguard.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.firebase.auth.FirebaseAuth
import com.phoneguard.app.service.CommandListenerService
import com.phoneguard.app.service.LocationService
import com.phoneguard.app.util.Prefs

/**
 * After a reboot, resume protection for a signed-in owner: always restart the
 * command listener (so remote commands keep working), and restart location
 * tracking if it was switched on.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (FirebaseAuth.getInstance().currentUser == null) return

        CommandListenerService.start(context)
        if (Prefs.get(context).tracking) {
            LocationService.start(context)
        }
    }
}
