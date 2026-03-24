import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

let app, auth, db, storage;
let isInitialized = false;

export const initFirebase = async () => {
    if (isInitialized) return { app, auth, db, storage };
    try {
        const config = {
  "apiKey": "AIzaSyAghUU6j4CyBYp5nw9R7foZvg7dqAR2Fy0",
  "appId": "1:488324444704:web:62c3c12598dfb8f0460245",
  "authDomain": "goalie-coach-dev-11a17.firebaseapp.com",
  "databaseURL": "",
  "measurementId": "G-XJG7JKQFWJ",
  "messagingSenderId": "488324444704",
  "projectId": "goalie-coach-dev-11a17",
  "storageBucket": "goalie-coach-dev-11a17.firebasestorage.app"
};
        
        if (!config.apiKey) console.warn("Firebase Config missing! Check Firebase Hosting setup.");
        
        app = initializeApp(config);
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        isInitialized = true;
        
        return { app, auth, db, storage };
    } catch (error) {
        console.error("Failed to fetch Firebase config:", error);
    }
}
