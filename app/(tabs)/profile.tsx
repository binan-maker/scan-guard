import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseAuth } from "@/lib/firebase";
import { updateProfile } from "firebase/auth";
import Animated, { FadeInDown } from "react-native-reanimated";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.displayName || "");
  const [savingName, setSavingName] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const tabBarHeight = 60 + insets.bottom;

  async function handleSaveName() {
    if (!newName.trim() || !firebaseAuth.currentUser) return;
    setSavingName(true);
    try {
      await updateProfile(firebaseAuth.currentUser, { displayName: newName.trim() });
      setEditingName(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not update name. Try again.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  }

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.centeredBox}>
          <View style={styles.guestAvatar}>
            <Ionicons name="person-outline" size={48} color={Colors.dark.textMuted} />
          </View>
          <Text style={styles.guestTitle}>You're not signed in</Text>
          <Text style={styles.guestSub}>Sign in to view and manage your profile</Text>
          <Pressable onPress={() => router.push("/(auth)/login")} style={styles.signInBtn}>
            <Ionicons name="log-in-outline" size={20} color="#000" />
            <Text style={styles.signInBtnText}>Sign In</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(auth)/register")} style={styles.registerBtn}>
            <Text style={styles.registerBtnText}>Create Account</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const initials = user.displayName
    ? user.displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 20 }]}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={styles.header}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>{initials}</Text>
            </View>
            <View style={styles.headerInfo}>
              {editingName ? (
                <View style={styles.editNameRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={newName}
                    onChangeText={setNewName}
                    autoFocus
                    maxLength={40}
                    placeholderTextColor={Colors.dark.textMuted}
                  />
                  <Pressable onPress={handleSaveName} disabled={savingName} style={styles.saveNameBtn}>
                    {savingName ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Text style={styles.saveNameBtnText}>Save</Text>
                    )}
                  </Pressable>
                  <Pressable onPress={() => { setEditingName(false); setNewName(user.displayName); }} style={styles.cancelNameBtn}>
                    <Ionicons name="close" size={18} color={Colors.dark.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => { setEditingName(true); setNewName(user.displayName); }}
                  style={styles.nameRow}
                >
                  <Text style={styles.displayName} numberOfLines={1}>{user.displayName}</Text>
                  <Ionicons name="pencil-outline" size={16} color={Colors.dark.textMuted} style={{ marginLeft: 6 }} />
                </Pressable>
              )}
              <Text style={styles.emailText} numberOfLines={1}>{user.email}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Account Section */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: Colors.dark.primaryDim }]}>
                <Ionicons name="person-outline" size={18} color={Colors.dark.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Display Name</Text>
                <Text style={styles.infoValue}>{user.displayName}</Text>
              </View>
              <Pressable onPress={() => { setEditingName(true); setNewName(user.displayName); }}>
                <Ionicons name="pencil-outline" size={18} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
            <View style={styles.cardDivider} />
            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: Colors.dark.accentDim }]}>
                <Ionicons name="mail-outline" size={18} color={Colors.dark.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{user.email}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Activity */}
        <Animated.View entering={FadeInDown.duration(400).delay(200)}>
          <Text style={styles.sectionTitle}>Activity</Text>
          <View style={styles.card}>
            <Pressable
              style={styles.menuRow}
              onPress={() => router.push("/(tabs)/history")}
            >
              <View style={[styles.infoIcon, { backgroundColor: Colors.dark.primaryDim }]}>
                <Ionicons name="time-outline" size={18} color={Colors.dark.primary} />
              </View>
              <Text style={styles.menuRowText}>Scan History</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        </Animated.View>

        {/* Settings */}
        <Animated.View entering={FadeInDown.duration(400).delay(300)}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.card}>
            <Pressable
              style={styles.menuRow}
              onPress={() => router.push("/(tabs)/settings")}
            >
              <View style={[styles.infoIcon, { backgroundColor: Colors.dark.surfaceLight }]}>
                <Ionicons name="settings-outline" size={18} color={Colors.dark.textSecondary} />
              </View>
              <Text style={styles.menuRowText}>App Settings</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        </Animated.View>

        {/* Sign out */}
        <Animated.View entering={FadeInDown.duration(400).delay(400)}>
          <Pressable onPress={handleSignOut} style={styles.signOutBtn}>
            <Ionicons name="log-out-outline" size={20} color={Colors.dark.danger} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  scrollContent: { padding: 20 },

  centeredBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  guestAvatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.dark.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 8,
  },
  guestTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.dark.text, textAlign: "center" },
  guestSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.dark.textSecondary, textAlign: "center" },
  signInBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dark.primary, paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 16, marginTop: 8,
  },
  signInBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#000" },
  registerBtn: { paddingVertical: 12, paddingHorizontal: 24 },
  registerBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.dark.primary },

  header: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: Colors.dark.surface, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 24,
  },
  avatarLarge: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.dark.primaryDim, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.dark.primary, flexShrink: 0,
  },
  avatarLargeText: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.dark.primary },
  headerInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  displayName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.dark.text, flexShrink: 1 },
  emailText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.dark.textSecondary },
  editNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  nameInput: {
    flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.dark.text,
    backgroundColor: Colors.dark.surfaceLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.dark.primary,
  },
  saveNameBtn: {
    backgroundColor: Colors.dark.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  saveNameBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000" },
  cancelNameBtn: { padding: 6 },

  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.dark.textMuted, marginBottom: 8, marginLeft: 4, textTransform: "uppercase", letterSpacing: 0.8 },
  card: {
    backgroundColor: Colors.dark.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 24, overflow: "hidden",
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  infoIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.dark.textMuted, marginBottom: 2 },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.dark.text },
  cardDivider: { height: 1, backgroundColor: Colors.dark.surfaceBorder, marginHorizontal: 16 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  menuRowText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.dark.text },
  signOutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.dark.dangerDim, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.dark.danger + "30",
  },
  signOutText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.dark.danger },
});
