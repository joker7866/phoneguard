<h1 align="center">🛡️ PhoneGuard</h1>

<p align="center"><b>A Find-My-Device style anti-theft system for your own phone — Android app + live web dashboard, running entirely on Firebase's free plan.</b></p>

<p align="center">
<img src="https://img.shields.io/badge/Kotlin-7F52FF?style=for-the-badge&logo=kotlin&logoColor=white" alt="Kotlin"/> <img src="https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android"/> <img src="https://img.shields.io/badge/Jetpack%20Compose-4285F4?style=for-the-badge&logo=jetpackcompose&logoColor=white" alt="Jetpack Compose"/> <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=white" alt="React"/> <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/> <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/> <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=white" alt="Firebase"/> <img src="https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white" alt="Leaflet"/>
</p>

## ✨ Highlights

- **Remote commands** — Locate, Ring, Lock, Start/Stop tracking from the browser, executed in real time
- **Live map + location history** with route playback, distance, stop detection and daily activity reports
- **Geofence zones** with enter/leave alerts
- **Multiple devices** and family labels, push messages to the phone
- **Owner-only Firestore security rules** — no server or paid plan needed

---
A Find-My-Device–style anti-theft system for a phone you own. Runs entirely on
Firebase's **free Spark plan** — no Cloud Functions, no billing.

| Part | Path | What it does |
|------|------|--------------|
| **Android app** | `android/` | Registers the phone under your account, reports location, and runs a foreground listener that executes remote commands (locate, ring, lock, start/stop tracking). |
| **Web dashboard** | `web/` | React app: sign in, see your devices on a map, send commands. |
| **Cloud Functions** | `functions/` | **Optional / legacy.** A server-side command path (needs the paid Blaze plan). The app does **not** use it; kept for reference only. |

## Data model

```
devices/{androidId}
  ownerUid, name, model, battery, lat, lng, accuracy, tracking, lastSeen
  locations/{auto}   # lat, lng, accuracy, battery, timestamp  (history/track)
  commands/{auto}    # type, status(pending|done|failed), issuedBy, createdAt, handledAt
```

Commands flow **dashboard → writes a `commands` doc in Firestore → phone's
CommandListenerService reacts in real time → runs it → writes status back →
dashboard sees it live.** Firestore security rules keep everything owner-only,
so the dashboard writing commands directly is safe — no server component needed.

## One-time Firebase setup (free Spark plan)

1. Create a Firebase project. Enable **Authentication → Email/Password** and **Firestore Database**.
2. Create the owner account under Authentication (email + password) — that is your login.
3. Put the project id in `.firebaserc` (replace `phoneguard-REPLACE-ME`).
4. `npm i -g firebase-tools && firebase login`.

## Security rules

```bash
firebase deploy --only firestore:rules
```

`firestore.rules` restricts every device and its `locations`/`commands`
subdocuments to `ownerUid == request.auth.uid`, so only the signed-in owner can
read location history or issue commands.

## Android app

1. In the Firebase console add an **Android app** with package `com.phoneguard.app`, download `google-services.json`, and place it at `android/app/google-services.json` (an `.example` is provided).
2. Build/run:
   ```bash
   cd android
   ./gradlew assembleDebug      # or open in Android Studio
   ```
   Requires JDK 17+. The Gradle wrapper (8.11.1) and AGP 8.7 are already configured.
3. In the app: sign in with the owner account, grant location (incl. **background**) and notification permissions, optionally enable **Remote lock** (Device Admin), and toggle tracking. "Register this device" writes the device doc + FCM token.

## Web dashboard

```bash
cd web
npm install
cp .env.example .env.local      # fill in the web SDK config from the Firebase console
npm run dev                     # http://localhost:5173
npm run build && firebase deploy --only hosting   # production
```

## Notes

- This is an **owner-operated recovery tool**: the phone shows a persistent "protection active" notification, access is gated by the owner's login, and all data is owner-scoped. It is not designed for covert monitoring of someone else's device.
- Emulators: `firebase emulators:start` (config in `firebase.json`).


---

## 👨‍💻 Author

**Kishore** — Mechanical engineer turned software developer, building practical apps for everyday problems in Tamil Nadu and India.

- GitHub: [@joker7866](https://github.com/joker7866)

<p align="center"><sub>⭐ If you find this project useful, consider giving it a star!</sub></p>
