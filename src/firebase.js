import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

const missingKeys = requiredKeys.filter((key) => !import.meta.env[key]);
export const firebaseConfigured = missingKeys.length === 0;

let auth = null;
let db = null;
let storage = null;

if (firebaseConfigured) {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    ...(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
      ? { messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID }
      : {}),
    ...(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
      ? { storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET }
      : {}),
  };
  const app = getApps().length ? getApp() : initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { auth, db, storage };