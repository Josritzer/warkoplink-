# Firebase Hosting deployment

The production workflow deploys only the dedicated `sl-community-platform` Firebase project. It builds the Vite app with the public web settings from `.env.example`, then deploys both Firebase Hosting and the repository's `firestore.rules`. Automated tests are intentionally not run by this workflow.

## One-time GitHub secret

The workflow requires a repository Actions secret named:

`FIREBASE_SERVICE_ACCOUNT_SL_COMMUNITY_PLATFORM`

Create a dedicated Google Cloud/Firebase service account for this community project, grant the permissions required to deploy Firebase Hosting and Firestore Security Rules, generate its JSON key, and save the complete JSON as the repository secret:

GitHub repository → Settings → Secrets and variables → Actions → New repository secret.

Do not commit the JSON key, paste it into chat, or reuse a Bookingpijat.com / production SL RELAX service account. The workflow fails early with a clear message if the secret is missing or malformed.

## Deployment

After the changes are merged into `main`, pushes to relevant application/configuration files run the build and deploy Hosting plus Firestore Rules. A manual run is also available under Actions → Deploy SL RELAX COMMUNITY to Firebase Hosting.

The Firebase web settings in `.env.example` are client-side configuration, not Firebase Admin credentials. Access to Authentication and Firestore must still be controlled by Firebase Auth settings and Firestore Security Rules.

## Firebase Console prerequisites

Before deployment, confirm Email/Password (or the intended sign-in provider) is enabled in Firebase Authentication and the Cloud Firestore database has been created in the `sl-community-platform` project. The service account must have permission to publish Hosting and Firestore Rules.

## Live URL

Firebase Hosting normally assigns a `web.app` and `firebaseapp.com` URL. Confirm the actual URL and deployment status in Firebase Console → Hosting after the workflow completes; do not assume a URL before Firebase confirms it.
