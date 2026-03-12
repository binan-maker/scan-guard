import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, displayName: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  googleRequest: ReturnType<typeof Google.useAuthRequest>[0];
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GOOGLE_WEB_CLIENT_ID = "971359442211-dppv9u14kun8mo5c0e07pr6f6veh81aa.apps.googleusercontent.com";
const GOOGLE_ANDROID_CLIENT_ID = "971359442211-j2emebstu4e63sd7u56k852ok1sb9rs2.apps.googleusercontent.com";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    scopes: ["profile", "email"],
  });

  useEffect(() => {
    loadStoredAuth();
  }, []);

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const { authentication } = googleResponse;
      if (authentication?.accessToken) {
        handleGoogleAccessToken(authentication.accessToken);
      }
    }
  }, [googleResponse]);

  async function loadStoredAuth() {
    try {
      const storedToken = await AsyncStorage.getItem("auth_token");
      if (storedToken) {
        const baseUrl = getApiUrl();
        const res = await fetch(`${baseUrl}api/auth/me`, {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setToken(storedToken);
        } else {
          await AsyncStorage.removeItem("auth_token");
        }
      }
    } catch (e) {
      console.error("Auth load error:", e);
    } finally {
      setIsLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    const baseUrl = getApiUrl();
    const res = await fetch(`${baseUrl}api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Sign in failed");
    await AsyncStorage.setItem("auth_token", data.token);
    setUser(data.user);
    setToken(data.token);
  }

  async function signUp(email: string, displayName: string, password: string) {
    const baseUrl = getApiUrl();
    const res = await fetch(`${baseUrl}api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, displayName, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Sign up failed");
    await AsyncStorage.setItem("auth_token", data.token);
    setUser(data.user);
    setToken(data.token);
  }

  async function handleGoogleAccessToken(accessToken: string) {
    const baseUrl = getApiUrl();
    const res = await fetch(`${baseUrl}api/auth/google-signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Google sign-in failed");
    await AsyncStorage.setItem("auth_token", data.token);
    setUser(data.user);
    setToken(data.token);
  }

  async function signInWithGoogle() {
    await promptGoogleAsync();
  }

  async function signOut() {
    try {
      if (token) {
        const baseUrl = getApiUrl();
        await fetch(`${baseUrl}api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (e) {}
    await AsyncStorage.removeItem("auth_token");
    setUser(null);
    setToken(null);
  }

  const value = useMemo(
    () => ({ user, token, isLoading, signIn, signUp, signOut, signInWithGoogle, googleRequest }),
    [user, token, isLoading, googleRequest]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
