import { initializeApp, getApps } from "firebase/app";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyClEPO1EIRG3vxbQgS6l9AdZj0dIt765e0",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "scan-guard-19a7f",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "scan-guard-19a7f.firebasestorage.app",
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || "https://scan-guard-19a7f-default-rtdb.asia-southeast1.firebasedatabase.app",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:971359442211:android:96d2747d81b499102fa896",
  messagingSenderId: "971359442211",
};

export const firebaseApp = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];
