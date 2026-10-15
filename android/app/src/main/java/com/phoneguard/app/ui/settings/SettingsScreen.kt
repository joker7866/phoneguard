package com.phoneguard.app.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.phoneguard.app.ActivityActions

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    actions: ActivityActions,
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    var adminActive by remember { mutableStateOf(actions.isAdminActive()) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Setup & permissions") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "Grant these so PhoneGuard can protect this phone.",
                style = MaterialTheme.typography.bodyMedium
            )

            SetupStep("1", "Location & notification permission",
                "Allow PhoneGuard to use GPS and show its status notification.",
                actions.requestCorePermissions)
            SetupStep("2", "Background location",
                "Choose \"Allow all the time\" so tracking keeps working when the app is closed.",
                actions.requestBackgroundLocation)
            SetupStep("3", "Ignore battery optimization",
                "Stops the system from killing protection in the background.",
                actions.requestBatteryExemption)
            SetupStep("4", if (adminActive) "Remote lock enabled" else "Enable remote lock (Device Admin)",
                "Lets you lock the phone from the website.") {
                actions.requestDeviceAdmin()
                adminActive = actions.isAdminActive()
            }

            Button(onClick = actions.startProtection, modifier = Modifier.fillMaxWidth()) {
                Text("Start / restart protection")
            }

            OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
                Text("Sign out")
            }
        }
    }
}

@Composable
private fun SetupStep(number: String, title: String, desc: String, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("$number. $title", fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(2.dp))
                Text(desc, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.width(12.dp))
            FilledTonalButton(onClick = onClick) { Text("Grant") }
        }
    }
}
