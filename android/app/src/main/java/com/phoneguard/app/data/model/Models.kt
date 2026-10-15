package com.phoneguard.app.data.model

/** A location point stored under devices/{id}/locations. */
data class LocationPoint(
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    val accuracy: Float = 0f,
    val speed: Float = 0f,       // metres/second, 0 if unknown
    val altitude: Double = 0.0,  // metres above sea level, 0 if unknown
    val battery: Int = -1,
    val timestamp: Long = 0L
)

/** A message the owner sends from the dashboard to this phone. */
data class Notification(
    val title: String = "PhoneGuard",
    val body: String = "",
    val delivered: Boolean = false,
    val createdAt: Long = 0L
)

/** Command types the web dashboard can send to the phone. */
object CommandType {
    const val LOCATE = "LOCATE"
    const val START_TRACKING = "START_TRACKING"
    const val STOP_TRACKING = "STOP_TRACKING"
    const val RING = "RING"
    const val STOP_RING = "STOP_RING"
    const val LOCK = "LOCK"
}

/** Command status values written back to Firestore. */
object CommandStatus {
    const val PENDING = "pending"
    const val DONE = "done"
    const val FAILED = "failed"
}
