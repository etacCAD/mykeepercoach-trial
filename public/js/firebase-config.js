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
  "apiKey": "AIzaSyD3-c36MGfn15j9O45R62-uNOPfbVHhgtU",
  "appId": "1:969478109699:web:86f9f891a954f6ec90ac36",
  "authDomain": "mykeepercoach-prod.firebaseapp.com",
  "messagingSenderId": "969478109699",
  "projectId": "mykeepercoach-prod",
  "storageBucket": "mykeepercoach-prod.firebasestorage.app"
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
