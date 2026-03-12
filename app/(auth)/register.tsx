import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Link, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import GoogleIcon from "@/components/GoogleIcon";

export default function RegisterScreen() {
  const { signUp, signInWithGoogle, googleRequest, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  useEffect(() => {
    if (user && googleLoading) {
      setGoogleLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismissAll();
    }
  }, [user]);

  async function handleRegister() {
    const newFieldErrors = { name: "", email: "", password: "" };
    let hasFieldError = false;

    if (!displayName.trim()) {
      newFieldErrors.name = "Name is required.";
      hasFieldError = true;
    }
    if (!email.trim()) {
      newFieldErrors.email = "Email address is required.";
      hasFieldError = true;
    }
    if (!password.trim()) {
      newFieldErrors.password = "Password is required.";
      hasFieldError = true;
    } else if (password.length < 6) {
      newFieldErrors.password = "Password must be at least 6 characters.";
      hasFieldError = true;
    }

    if (hasFieldError) {
      setFieldErrors(newFieldErrors);
      setError("");
      return;
    }

    setError("");
    setFieldErrors({ name: "", email: "", password: "" });
    setLoading(true);

    try {
      await signUp(email.trim(), displayName.trim(), password);
    } catch (e: any) {
      if (e.code === "auth/verification-sent") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setRegisteredEmail(email.trim());
        setVerificationSent(true);
      } else {
        setError(e.message || "Sign up failed. Please try again.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e.message || "Google sign-in failed. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGoogleLoading(false);
    }
  }

  if (verificationSent) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.dark.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
              <Ionicons name="mail-open-outline" size={40} color={Colors.dark.safe} />
            </View>
          </View>

          <Text style={styles.title}>Verify Your Email</Text>
          <Text style={styles.subtitle}>
            Your account has been created! A verification email has been sent to{"\n"}
            <Text style={{ color: Colors.dark.primary }}>{registeredEmail}</Text>
            {"\n\n"}
            Please click the link in the email to verify your account before signing in. Check your spam folder if you don't see it.
          </Text>

          <Pressable
            onPress={() => router.replace("/(auth)/login")}
            style={({ pressed }) => [styles.primaryButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.primaryButtonText}>Go to Sign In</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.dark.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="person-add" size={36} color={Colors.dark.primary} />
          </View>
        </View>

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>
          Join to comment, report, and sync your scan history
        </Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color={Colors.dark.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleGoogleSignIn}
          disabled={googleLoading || !googleRequest}
          style={({ pressed }) => [
            styles.googleButton,
            { opacity: pressed || googleLoading || !googleRequest ? 0.7 : 1 },
          ]}
        >
          {googleLoading ? (
            <ActivityIndicator color={Colors.dark.text} size="small" />
          ) : (
            <>
              <GoogleIcon size={20} />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or create with email</Text>
          <View style={styles.dividerLine} />
        </View>

        <View>
          <View style={[
            styles.inputContainer,
            fieldErrors.name ? styles.inputContainerError : null,
          ]}>
            <Ionicons
              name="person-outline"
              size={20}
              color={fieldErrors.name ? Colors.dark.danger : Colors.dark.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Display name"
              placeholderTextColor={Colors.dark.textMuted}
              value={displayName}
              onChangeText={(v) => { setDisplayName(v); if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: "" })); }}
              autoCapitalize="words"
            />
          </View>
          {fieldErrors.name ? (
            <Text style={styles.fieldError}>{fieldErrors.name}</Text>
          ) : null}
        </View>

        <View>
          <View style={[
            styles.inputContainer,
            fieldErrors.email ? styles.inputContainerError : null,
          ]}>
            <Ionicons
              name="mail-outline"
              size={20}
              color={fieldErrors.email ? Colors.dark.danger : Colors.dark.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={Colors.dark.textMuted}
              value={email}
              onChangeText={(v) => { setEmail(v); if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: "" })); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {fieldErrors.email ? (
            <Text style={styles.fieldError}>{fieldErrors.email}</Text>
          ) : null}
        </View>

        <View>
          <View style={[
            styles.inputContainer,
            fieldErrors.password ? styles.inputContainerError : null,
          ]}>
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={fieldErrors.password ? Colors.dark.danger : Colors.dark.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Password (min 6 characters)"
              placeholderTextColor={Colors.dark.textMuted}
              value={password}
              onChangeText={(v) => { setPassword(v); if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: "" })); }}
              secureTextEntry={!showPassword}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={Colors.dark.textMuted}
              />
            </Pressable>
          </View>
          {fieldErrors.password ? (
            <Text style={styles.fieldError}>{fieldErrors.password}</Text>
          ) : null}
        </View>

        <Pressable
          onPress={handleRegister}
          disabled={loading}
          style={({ pressed }) => [
            styles.primaryButton,
            { opacity: pressed || loading ? 0.8 : 1 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryButtonText}>Create Account</Text>
          )}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text style={styles.linkText}>Sign In</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
    gap: 16,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 8,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.primaryDim,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 22,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.dark.dangerDim,
    padding: 12,
    borderRadius: 12,
  },
  errorText: {
    color: Colors.dark.danger,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    flex: 1,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.surfaceBorder,
    paddingHorizontal: 16,
  },
  inputContainerError: {
    borderColor: Colors.dark.danger,
    backgroundColor: Colors.dark.dangerDim,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.text,
  },
  eyeBtn: {
    padding: 4,
  },
  fieldError: {
    color: Colors.dark.danger,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  primaryButton: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#000",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  footerText: {
    color: Colors.dark.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  linkText: {
    color: Colors.dark.primary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.surfaceBorder,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textMuted,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.surfaceBorder,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  googleButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.text,
  },
});
