// src/lib/firebase.js
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// Your config object
const firebaseConfig = {
    apiKey: "AIzaSyDS5RsnYL49tertpcIUXPa3dppw_soU1FQ",
    authDomain: "led-react-6204e.firebaseapp.com",
    projectId: "led-react-6204e",
    storageBucket: "led-react-6204e.firebasestorage.app",
    messagingSenderId: "500086523818",
    appId: "1:500086523818:web:74b4a57f9c55730eee4dd3",
    measurementId: "G-B0D52YG6QQ"
};

// Initialize only if not already initialized
let app;
if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
} else {
    app = firebase.app();
}

// Export the instances so other files can use them
export const auth = firebase.auth();
export const db = firebase.firestore();
export const appId = 'admire-signage-external';