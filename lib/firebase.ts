import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyClEPO1EIRG3vxbQgS6l9AdZj0dIt765e0",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "scan-guard-19a7f",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "scan-guard-19a7f.firebasestorage.app",
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || "https://scan-guard-19a7f-default-rtdb.asia-southeast1.firebasedatabase.app",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:971359442211:android:96d2747d81b499102fa896",
  messagingSenderId: "971359442211",
};

// Only initialize the app once (hot-reload safe)
export const firebaseApp = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

// On native, use AsyncStorage persistence so auth state survives app restarts.
// initializeAuth can only be called once per app instance; on hot-reload we
// fall back to getAuth() which returns the already-initialized instance.
function buildAuth() {
  if (Platform.OS === "web") {
    return getAuth(firebaseApp);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e: any) {
    // auth/already-initialized → return the existing instance
    return getAuth(firebaseApp);
  }
}

export const firebaseAuth = buildAuth();
export const firestore = getFirestore(firebaseApp);
export const realtimeDB = getDatabase(firebaseApp);

import { getStorage } from "firebase/storage";
export const storage = getStorage(firebaseApp);
