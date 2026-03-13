import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onIdTokenChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  sendPasswordResetEmail,
  sendEmailVerification,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { firebaseAuth, firestore } from "@/lib/firebase";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  emailVerified: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, displayName: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshUser: () => Promise<void>;
  googleRequest: ReturnType<typeof Google.useAuthRequest>[0];
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GOOGLE_WEB_CLIENT_ID = "971359442211-dppv9u14kun8mo5c0e07pr6f6veh81aa.apps.googleusercontent.com";

export function getAuthErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password. Please try again.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in instead.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/requires-recent-login":
      return "For security, please sign out and sign back in before making this change.";
    case "auth/email-not-verified":
      return "Please verify your email address before signing in. Check your inbox for a verification link.";
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled. Please contact support.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled. Please try again.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email using a different sign-in method.";
    case "ACCOUNT_DELETED":
      return "This account has been deleted.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function mapFirebaseError(e: any): Error {
  const code = e?.code ?? e?.message ?? "";
  return new Error(getAuthErrorMessage(code));
}

async function syncUserToFirestore(fbUser: FirebaseUser, displayName?: string) {
  try {
    const userRef = doc(firestore, "users", fbUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: displayName || fbUser.displayName || fbUser.email?.split("@")[0] || "User",
        photoURL: fbUser.photoURL || null,
        isDeleted: false,
        createdAt: serverTimestamp(),
      });
    } else if (snap.data().isDeleted) {
      throw new Error("ACCOUNT_DELETED");
    }
  } catch (e: any) {
    if (e.message === "ACCOUNT_DELETED") throw new Error("This account has been deleted.");
  }
}

function toAuthUser(fbUser: FirebaseUser): AuthUser {
  return {
    id: fbUser.uid,
    email: fbUser.email ?? "",
    displayName: fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "User",
    photoURL: fbUser.photoURL,
    emailVerified: fbUser.emailVerified,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    androidClientId: "971359442211-j2emebstu4e63sd7u56k852ok1sb9rs2.apps.googleusercontent.com",
    scopes: ["profile", "email"],
  });

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(firebaseAuth, async (fbUser) => {
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          setUser(toAuthUser(fbUser));
          setToken(idToken);
        } catch {
          setUser(null);
          setToken(null);
        }
      } else {
        setUser(null);
        setToken(null);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const { authentication } = googleResponse;
      if (authentication?.accessToken) {
        handleGoogleAccessToken(authentication.accessToken);
      }
    }
  }, [googleResponse]);

  async function signIn(email: string, password: string) {
    try {
      const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
      if (!cred.user.emailVerified) {
        await firebaseSignOut(firebaseAuth);
        const err = new Error(getAuthErrorMessage("auth/email-not-verified")) as any;
        err.code = "auth/email-not-verified";
        throw err;
      }
      await syncUserToFirestore(cred.user);
      const idToken = await cred.user.getIdToken();
      setUser(toAuthUser(cred.user));
      setToken(idToken);
    } catch (e: any) {
      if (e.code === "auth/email-not-verified") throw e;
      throw mapFirebaseError(e);
    }
  }

  async function signUp(email: string, displayName: string, password: string) {
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      await updateProfile(cred.user, { displayName });
      await sendEmailVerification(cred.user);
      await syncUserToFirestore(cred.user, displayName);
      await firebaseSignOut(firebaseAuth);
      const err = new Error("VERIFICATION_SENT") as any;
      err.code = "auth/verification-sent";
      throw err;
    } catch (e: any) {
      if (e.code === "auth/verification-sent") throw e;
      throw mapFirebaseError(e);
    }
  }

  async function handleGoogleAccessToken(accessToken: string) {
    try {
      const credential = GoogleAuthProvider.credential(null, accessToken);
      const cred = await signInWithCredential(firebaseAuth, credential);
      await syncUserToFirestore(cred.user);
      const idToken = await cred.user.getIdToken();
      setUser(toAuthUser(cred.user));
      setToken(idToken);
    } catch (e: any) {
      throw mapFirebaseError(e);
    }
  }

  async function signInWithGoogle() {
    await promptGoogleAsync();
  }

  async function signOut() {
    await firebaseSignOut(firebaseAuth);
    setUser(null);
    setToken(null);
  }

  async function sendPasswordReset(email: string) {
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
    } catch (e: any) {
      throw mapFirebaseError(e);
    }
  }

  async function resendVerification() {
    try {
      const currentUser = firebaseAuth.currentUser;
      if (currentUser) {
        await sendEmailVerification(currentUser);
      }
    } catch (e: any) {
      throw mapFirebaseError(e);
    }
  }

  async function refreshUser() {
    const fbUser = firebaseAuth.currentUser;
    if (!fbUser) return;
    try {
      await fbUser.reload();
      const reloaded = firebaseAuth.currentUser;
      if (reloaded) {
        setUser(toAuthUser(reloaded));
        // Also sync updated displayName/photoURL to Firestore
        try {
          const { doc, updateDoc } = await import("firebase/firestore");
          const { firestore } = await import("@/lib/firebase");
          await updateDoc(doc(firestore, "users", reloaded.uid), {
            displayName: reloaded.displayName || "",
            photoURL: reloaded.photoURL || null,
          });
        } catch {}
      }
    } catch {}
  }

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      signIn,
      signUp,
      signOut,
      signInWithGoogle,
      sendPasswordReset,
      resendVerification,
      refreshUser,
      googleRequest,
    }),
    [user, token, isLoading, googleRequest]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
