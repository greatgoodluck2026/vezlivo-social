// firebase.js
// Vezlivo Fresh - Firebase setup

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCYNooK8PK4uDP0nIy5r3ngPtE5Dk4i50k",
  authDomain: "vezlivo-fresh.firebaseapp.com",
  databaseURL:
    "https://vezlivo-fresh-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "avezlivo-fresh",
  storageBucket: "vezlivo-fresh.firebasestorage.app",
  messagingSenderId: "496406406453",
  appId: "1:496406406453:web:259bf4df01c7c37fe6587c",
  measurementId: "G-Y7JRTGCT6H",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firebase services
const analytics = getAnalytics(app);
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

export {
  app,
  analytics,
  auth,
  database,
  storage,
};