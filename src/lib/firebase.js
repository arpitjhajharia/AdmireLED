// src/lib/firebase.js
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// Your config object (Preserved from your code)
const firebaseConfig = {
    apiKey: "AIzaSyDS5RsnYL49tertpcIUXPa3dppw_soU1FQ",
    authDomain: "led-react-6204e.firebaseapp.com",
    projectId: "led-react-6204e",
    storageBucket: "led-react-6204e.firebasestorage.app",
    messagingSenderId: "500086523818",
    appId: "1:500086523818:web:74b4a57f9c55730eee4dd3",
    measurementId: "G-B0D52YG6QQ"
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
export { secondaryApp };            // <--- Added this (Fixes the error)
export const firebaseApp = app;
export const appId = 'admire-signage-external'; // Preserved your ID
export default app;