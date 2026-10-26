# WarkopLink Android

Native Android starter built with Kotlin and Jetpack Compose. This folder is intentionally separate from the existing React/Vite web app.

## Build

The APK is built in GitHub Actions so development does not require Android Studio or a local Gradle installation.

1. Push changes on a branch named `warkoplink/*`, or run the **WarkopLink Android APK** workflow manually.
2. Open the workflow run in GitHub Actions.
3. Download the `warkoplink-debug-apk` artifact.

## Current scope

- Native Compose shell and bottom navigation.
- Placeholder Community, Obrolan, and Profil screens.
- No authentication or Firebase calls yet; this starter does not alter the existing web app or backend.
- Package ID: `com.warkoplink.app`.
