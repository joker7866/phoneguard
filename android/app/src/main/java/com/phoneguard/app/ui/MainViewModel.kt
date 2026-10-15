package com.phoneguard.app.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.ListenerRegistration
import com.phoneguard.app.data.DeviceRepository
import com.phoneguard.app.service.CommandListenerService
import com.phoneguard.app.service.LocationService
import com.phoneguard.app.util.BatteryUtil
import com.phoneguard.app.util.Prefs
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** UI state shared by the login and home screens. */
data class UiState(
    val loggedIn: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
    val registered: Boolean = false
)

/** A message from the owner, shown in the home notifications list. */
data class NotificationItem(
    val id: String,
    val title: String,
    val body: String,
    val createdAt: Long
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val repo: DeviceRepository,
    @ApplicationContext private val app: Context
) : ViewModel() {

    private val _state = MutableStateFlow(UiState(loggedIn = repo.isLoggedIn))
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val _notifications = MutableStateFlow<List<NotificationItem>>(emptyList())
    val notifications: StateFlow<List<NotificationItem>> = _notifications.asStateFlow()
    private var notifReg: ListenerRegistration? = null

    init {
        if (repo.isLoggedIn) {
            register()
            watchNotifications()
        }
    }

    private fun watchNotifications() {
        notifReg?.remove()
        notifReg = repo.notificationsQuery()?.addSnapshotListener { snap, _ ->
            if (snap != null) {
                _notifications.value = snap.documents.map {
                    NotificationItem(
                        id = it.id,
                        title = it.getString("title") ?: "PhoneGuard",
                        body = it.getString("body") ?: "",
                        createdAt = it.getLong("createdAt") ?: 0L
                    )
                }
            }
        }
    }

    override fun onCleared() {
        notifReg?.remove()
        super.onCleared()
    }

    fun login(email: String, password: String) {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val result = runCatching { repo.signIn(email, password) }
            if (result.isSuccess) {
                _state.update { it.copy(loggedIn = true, loading = false) }
                register()
                watchNotifications()
            } else {
                _state.update {
                    it.copy(loading = false, error = result.exceptionOrNull()?.message ?: "Sign-in failed")
                }
            }
        }
    }

    /** Create/refresh this device's document and start listening for commands. */
    fun register() {
        if (!repo.isLoggedIn) return
        CommandListenerService.start(app)
        viewModelScope.launch {
            runCatching { repo.registerDevice(BatteryUtil.level(app)) }
                .onSuccess { _state.update { it.copy(registered = true) } }
        }
    }

    /** Turn on background tracking and (re)start the foreground services. */
    fun startProtection() {
        Prefs.get(app).tracking = true
        viewModelScope.launch { runCatching { repo.setTracking(true) } }
        LocationService.start(app)
        CommandListenerService.start(app)
        register()
    }

    /** Revive the command listener when the app is reopened, in case the OS
     *  killed the background service. */
    fun ensureListening() {
        if (repo.isLoggedIn) CommandListenerService.start(app)
    }

    fun logout() {
        repo.signOut()
        LocationService.start(app, LocationService.ACTION_STOP)
        CommandListenerService.stop(app)
        _state.value = UiState(loggedIn = false)
    }
}
