// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPnKsY9DoBG8tSVzDlcIFRiMgmcNAe5Hk",
  authDomain: "iberia-restaurant.firebaseapp.com",
  projectId: "iberia-restaurant",
  storageBucket: "iberia-restaurant.firebasestorage.app",
  messagingSenderId: "516396997291",
  appId: "1:516396997291:web:72ccdfd7bf4cc49d0bf5ee"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);