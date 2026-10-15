package com.phoneguard.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.phoneguard.app.admin.PgDeviceAdminReceiver
import com.phoneguard.app.ui.MainViewModel
import com.phoneguard.app.ui.home.HomeScreen
import com.phoneguard.app.ui.login.LoginScreen
import com.phoneguard.app.ui.settings.SettingsScreen
import com.phoneguard.app.ui.theme.PhoneGuardTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * Callbacks the home screen uses to drive Android-level setup (permissions,
 * device admin, starting protection). Implemented by [MainActivity] because
 * these require an Activity context and result launchers.
 */
interface ActivityActions {
    fun isAdminActive(): Boolean
    fun requestDeviceAdmin()
    val requestCorePermissions: () -> Unit
    val requestBackgroundLocation: () -> Unit
    val requestBatteryExemption: () -> Unit
    val startProtection: () -> Unit
}

@AndroidEntryPoint
class MainActivity : ComponentActivity(), ActivityActions {

    private val vm: MainViewModel by viewModels()

    private val corePermissionLauncher =
        registerForActivityResult(RequestMultiplePermissions()) { /* re-rendered via state */ }
    private val backgroundPermissionLauncher =
        registerForActivityResult(RequestMultiplePermissions()) { }

    override fun onResume() {
        super.onResume()
        vm.ensureListening()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PhoneGuardTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val state by vm.state.collectAsStateWithLifecycle()
                    val notifications by vm.notifications.collectAsStateWithLifecycle()
                    var showSettings by rememberSaveable { mutableStateOf(false) }

                    when {
                        !state.loggedIn -> LoginScreen(state = state, onLogin = vm::login)
                        showSettings -> SettingsScreen(
                            actions = this,
                            onBack = { showSettings = false },
                            onLogout = { showSettings = false; vm.logout() }
                        )
                        else -> HomeScreen(
                            state = state,
                            notifications = notifications,
                            onOpenSettings = { showSettings = true }
                        )
                    }
                }
            }
        }
    }

    // --- ActivityActions -----------------------------------------------------

    override fun isAdminActive(): Boolean = PgDeviceAdminReceiver.isActive(this)

    override val requestCorePermissions: () -> Unit = {
        val perms = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms += Manifest.permission.POST_NOTIFICATIONS
        }
        corePermissionLauncher.launch(perms.toTypedArray())
    }

    override val requestBackgroundLocation: () -> Unit = {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            backgroundPermissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
        }
    }

    @SuppressLint("BatteryLife")
    override val requestBatteryExemption: () -> Unit = {
        runCatching {
            startActivity(
                Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:$packageName")
                )
            )
        }
    }

    override fun requestDeviceAdmin() {
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, PgDeviceAdminReceiver.componentName(this@MainActivity))
            putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, getString(R.string.device_admin_desc))
        }
        runCatching { startActivity(intent) }
    }

    override val startProtection: () -> Unit = { vm.startProtection() }
}
