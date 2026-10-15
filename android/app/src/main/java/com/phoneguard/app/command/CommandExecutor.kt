package com.phoneguard.app.command

import android.content.Context
import com.phoneguard.app.admin.PgDeviceAdminReceiver
import com.phoneguard.app.data.DeviceRepository
import com.phoneguard.app.data.model.CommandStatus
import com.phoneguard.app.data.model.CommandType
import com.phoneguard.app.service.LocationService
import com.phoneguard.app.util.AlarmPlayer
import com.phoneguard.app.util.Prefs

/**
 * Runs a single remote command and writes its result back to Firestore.
 * Called from the FCM service when a command arrives.
 */
class CommandExecutor(
    private val context: Context,
    private val repo: DeviceRepository
) {
    suspend fun run(commandId: String, type: String) {
        try {
            when (type) {
                CommandType.LOCATE ->
                    LocationService.start(context, LocationService.ACTION_LOCATE_ONCE)

                CommandType.START_TRACKING -> {
                    Prefs.get(context).tracking = true
                    repo.setTracking(true)
                    LocationService.start(context)
                }

                CommandType.STOP_TRACKING -> {
                    Prefs.get(context).tracking = false
                    repo.setTracking(false)
                    LocationService.start(context, LocationService.ACTION_STOP)
                }

                CommandType.RING -> AlarmPlayer.start(context)
                CommandType.STOP_RING -> AlarmPlayer.stop(context)

                CommandType.LOCK -> {
                    val ok = PgDeviceAdminReceiver.lockNow(context)
                    if (!ok) {
                        repo.markCommand(commandId, CommandStatus.FAILED, "Device admin not active")
                        return
                    }
                }

                else -> {
                    repo.markCommand(commandId, CommandStatus.FAILED, "Unknown command")
                    return
                }
            }
            repo.markCommand(commandId, CommandStatus.DONE)
        } catch (e: Exception) {
            repo.markCommand(commandId, CommandStatus.FAILED, e.message ?: "error")
        }
    }
}
