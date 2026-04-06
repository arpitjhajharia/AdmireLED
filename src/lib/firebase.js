// src/lib/firebase.js
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// Firebase config from environment variables
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// 1. Initialize the MAIN App
let app;
if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
} else {
    app = firebase.app();
}

// 2. Initialize the SECONDARY App (Required for User Manager)
// This allows the Admin to create users without getting logged out themselves.
const secondaryApp = !firebase.apps.find(a => a.name === 'secondary')
    ? firebase.initializeApp(firebaseConfig, 'secondary')
    : firebase.app('secondary');

// Exports
export const auth = app.auth();
export const db = app.firestore();

// Fix for Firestore 400 errors (Listen/channel) often seen on Safari or behind proxies/ad-blockers
// db.settings({ experimentalForceLongPolling: true });

export { secondaryApp };            // <--- Added this (Fixes the error)
export const firebaseApp = app;
export const appId = 'admire-signage-external'; // Preserved your ID
export default app;