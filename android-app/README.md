# WarkopLink Android

Native Android application built with Kotlin and Jetpack Compose, kept separate from the existing web app.

## Current native features

- Email/password sign-in and account registration with Firebase Authentication.
- Creates the member profile in the existing `profiles` collection.
- Live community feed from the existing `posts` collection (latest 50 posts).
- Text post creation with the four existing topic values and reaction-count display.
- Profile screen and sign-out.
- Explicit setup screen when Firebase configuration is not supplied.

## Firebase configuration

Do not commit API config values or service-account credentials to source control. The Android build accepts these Gradle properties or environment variables:

| Gradle property | Environment variable |
| --- | --- |
| `firebaseApiKey` | `WARKOP_FIREBASE_API_KEY` |
| `firebaseAppId` | `WARKOP_FIREBASE_APP_ID` |
| `firebaseProjectId` | `WARKOP_FIREBASE_PROJECT_ID` |
| `firebaseSenderId` | `WARKOP_FIREBASE_SENDER_ID` |

Example local build:

```sh
gradle --no-daemon assembleDebug \
  -PfirebaseApiKey="$WARKOP_FIREBASE_API_KEY" \
  -PfirebaseAppId="$WARKOP_FIREBASE_APP_ID" \
  -PfirebaseProjectId="$WARKOP_FIREBASE_PROJECT_ID" \
  -PfirebaseSenderId="$WARKOP_FIREBASE_SENDER_ID"
```

These values are Firebase client configuration, not admin credentials. Enable Email/Password sign-in in Firebase Authentication. The signed-in user's Firestore profile must exist before posting, and Firestore Rules remain the authority for access.

## Build

The **WarkopLink Android APK** GitHub Actions workflow builds a debug APK. Without the four Firebase values, the APK still builds but shows the configuration-required screen and cannot sign in. To produce a connected APK, supply the values to the build workflow via approved repository secrets; never add a service-account key to the Android app.
