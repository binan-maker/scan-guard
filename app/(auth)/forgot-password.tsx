import { useState } from "react";
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
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

export default function ForgotPasswordScreen() {
  const { sendPasswordReset } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleReset() {
    setError("");
    setEmailError("");

    if (!email.trim()) {
      setEmailError("Email address is required.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
    } catch (e: any) {
      setError(e.message || "Failed to send reset email.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
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
              <Ionicons name="checkmark-circle" size={40} color={Colors.dark.safe} />
            </View>
          </View>

          <Text style={styles.title}>Check Your Email</Text>
          <Text style={styles.subtitle}>
            A password reset link has been sent to{"\n"}
            <Text style={{ color: Colors.dark.primary }}>{email}</Text>
            {"\n\n"}
            Follow the link in the email to set a new password. If you don't see it, check your spam folder.
          </Text>

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.primaryButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.primaryButtonText}>Back to Sign In</Text>
          </Pressable>

          <Pressable
            onPress={() => { setSent(false); setEmail(""); }}
            style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.linkText}>Try a different email</Text>
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
            <Ionicons name="key-outline" size={40} color={Colors.dark.primary} />
          </View>
        </View>

        <Text style={styles.title}>Forgot Password?</Text>
        <Text style={styles.subtitle}>
          Enter the email address linked to your account and we'll send you a link to reset your password.
        </Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color={Colors.dark.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View>
          <View
            style={[
              styles.inputContainer,
              emailError ? styles.inputContainerError : null,
            ]}
          >
            <Ionicons
              name="mail-outline"
              size={20}
              color={emailError ? Colors.dark.danger : Colors.dark.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={Colors.dark.textMuted}
              value={email}
              onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(""); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {emailError ? (
            <Text style={styles.fieldError}>{emailError}</Text>
          ) : null}
        </View>

        <Pressable
          onPress={handleReset}
          disabled={loading}
          style={({ pressed }) => [
            styles.primaryButton,
            { opacity: pressed || loading ? 0.8 : 1 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryButtonText}>Send Reset Link</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.linkText}>Back to Sign In</Text>
        </Pressable>
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
    alignItems: "center",
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
  linkButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  linkText: {
    color: Colors.dark.primary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});
