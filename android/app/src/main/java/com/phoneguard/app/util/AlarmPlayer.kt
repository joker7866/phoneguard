package com.phoneguard.app.util

import android.content.Context
import android.media.AudioManager
import android.media.RingtoneManager
import android.media.Ringtone

/**
 * Plays the default alarm tone at full volume, overriding silent mode,
 * so a lost phone can be found by ear. Call stop() to silence it.
 */
object AlarmPlayer {
    private var ringtone: Ringtone? = null
    private var previousVolume: Int = -1

    fun start(context: Context) {
        if (ringtone?.isPlaying == true) return
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        previousVolume = am.getStreamVolume(AudioManager.STREAM_ALARM)
        am.setStreamVolume(
            AudioManager.STREAM_ALARM,
            am.getStreamMaxVolume(AudioManager.STREAM_ALARM),
            0
        )
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        ringtone = RingtoneManager.getRingtone(context, uri).apply {
            @Suppress("DEPRECATION")
            streamType = AudioManager.STREAM_ALARM
            play()
        }
    }

    fun stop(context: Context) {
        ringtone?.stop()
        ringtone = null
        if (previousVolume >= 0) {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.setStreamVolume(AudioManager.STREAM_ALARM, previousVolume, 0)
            previousVolume = -1
        }
    }
}
