# Firebase Hosting deployment

The production deployment workflow publishes only the `sl-community-platform` Firebase project.

## One-time GitHub secret

The workflow requires a GitHub Actions repository secret named:

`FIREBASE_SERVICE_ACCOUNT_SL_COMMUNITY_PLATFORM`

Create a dedicated Google Cloud/Firebase service account for this community project, grant it the Firebase Hosting Admin role (and only additional permissions strictly required by Firebase's deploy tooling), generate its JSON key, then add the complete JSON as the repository secret:

GitHub repository → Settings → Secrets and variables → Actions → New repository secret.

Do not commit the JSON key, paste it into chat, or reuse a Bookingpijat.com / production SL RELAX service account.

## Deployment

After the secret is added and this configuration is merged into `main`, pushes to `main` run tests, build the Vite site, and publish `dist` to Firebase Hosting. A manual run is also available under Actions → Deploy SL Community Platform to Firebase Hosting.

The site uses the public Firebase web settings in `.env.example` at build time. These are client-side web configuration, not Firebase Admin credentials. Access to Firebase Authentication and Firestore must still be controlled by Firebase Auth settings and Firestore Security Rules.

## Live URL

Firebase Hosting normally assigns a `web.app` and `firebaseapp.com` URL for the project. Verify the actual deployment URL in Firebase Console → Hosting after the first successful deployment; do not assume a URL before Firebase confirms it.
