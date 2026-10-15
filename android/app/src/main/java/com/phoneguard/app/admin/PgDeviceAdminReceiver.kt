package com.phoneguard.app.admin

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context

/** Device Admin receiver — grants PhoneGuard the right to lock the screen. */
class PgDeviceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        fun componentName(context: Context) =
            ComponentName(context, PgDeviceAdminReceiver::class.java)

        fun dpm(context: Context): DevicePolicyManager =
            context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

        fun isActive(context: Context): Boolean =
            dpm(context).isAdminActive(componentName(context))

        /** Lock the screen immediately. Requires admin to be active. */
        fun lockNow(context: Context): Boolean {
            return if (isActive(context)) {
                dpm(context).lockNow()
                true
            } else false
        }
    }
}
