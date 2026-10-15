package com.phoneguard.app.util

import android.content.Context

/** Tiny shared-preferences wrapper for local flags. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("phoneguard", Context.MODE_PRIVATE)

    var tracking: Boolean
        get() = sp.getBoolean("tracking", false)
        set(v) = sp.edit().putBoolean("tracking", v).apply()

    companion object {
        fun get(context: Context) = Prefs(context)
    }
}
