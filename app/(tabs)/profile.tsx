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
  Image,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useCallback } from "react";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseAuth } from "@/lib/firebase";
import { updateProfile } from "firebase/auth";
import {
  getUserStats,
  updateUserPhotoURL,
  getUserPhotoURL,
  type UserStats,
} from "@/lib/firestore-service";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.displayName || "");
  const [savingName, setSavingName] = useState(false);
  const [stats, setStats] = useState<UserStats>({ followingCount: 0, scanCount: 0, commentCount: 0, totalLikesReceived: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [photoURL, setPhotoURL] = useState<string | null>(user?.photoURL || null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const tabBarHeight = 60 + insets.bottom;

  const loadStats = useCallback(async () => {
    if (!user) return;
    setStatsLoading(true);
    try {
      const [s, photo] = await Promise.all([
        getUserStats(user.id),
        getUserPhotoURL(user.id),
      ]);
      setStats(s);
      if (photo) setPhotoURL(photo);
    } catch {}
    setStatsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

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

  async function handlePickPhoto(source: "camera" | "gallery") {
    setPhotoModalOpen(false);
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert("Permission needed", "Camera access is required."); return; }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.5,
          base64: true,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert("Permission needed", "Gallery access is required."); return; }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.5,
          base64: true,
        });
      }
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingPhoto(true);
      const base64Uri = `data:image/jpeg;base64,${asset.base64}`;
      setPhotoURL(base64Uri);
      if (user) {
        await updateUserPhotoURL(user.id, base64Uri);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not update photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => {
        await signOut();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }},
    ]);
  }

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.navBar}>
          <Text style={styles.navTitle}>Profile</Text>
        </View>
        <View style={styles.centeredBox}>
          <View style={styles.guestAvatar}>
            <Ionicons name="person-outline" size={52} color={Colors.dark.textMuted} />
          </View>
          <Text style={styles.guestTitle}>You're not signed in</Text>
          <Text style={styles.guestSub}>Sign in to view your profile, stats, and activity</Text>
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

  const memberSince = "2024";

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Nav */}
      <View style={styles.navBar}>
        <Text style={styles.navTitle}>Profile</Text>
        <Pressable
          onPress={() => router.push("/(tabs)/settings")}
          style={styles.settingsBtn}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={22} color={Colors.dark.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 24 }]}
      >
        {/* Hero card */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={styles.heroCard}>
            <Pressable onPress={() => setPhotoModalOpen(true)} style={styles.avatarWrapper}>
              {uploadingPhoto ? (
                <View style={styles.avatarLarge}>
                  <ActivityIndicator color={Colors.dark.primary} />
                </View>
              ) : photoURL ? (
                <Image source={{ uri: photoURL }} style={styles.avatarLargeImg} />
              ) : (
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarLargeText}>{initials}</Text>
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={13} color="#000" />
              </View>
            </Pressable>

            <View style={styles.heroInfo}>
              {editingName ? (
                <View style={styles.editNameRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={newName}
                    onChangeText={setNewName}
                    autoFocus
                    maxLength={40}
                    placeholderTextColor={Colors.dark.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                  />
                  <Pressable onPress={handleSaveName} disabled={savingName} style={styles.saveNameBtn}>
                    {savingName ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.saveNameBtnText}>Save</Text>}
                  </Pressable>
                  <Pressable onPress={() => { setEditingName(false); setNewName(user.displayName); }} style={styles.cancelNameBtn}>
                    <Ionicons name="close" size={18} color={Colors.dark.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => { setEditingName(true); setNewName(user.displayName); }} style={styles.nameRow}>
                  <Text style={styles.displayName} numberOfLines={1}>{user.displayName}</Text>
                  <Ionicons name="pencil-outline" size={15} color={Colors.dark.primary} style={{ marginLeft: 6 }} />
                </Pressable>
              )}
              <Text style={styles.emailText} numberOfLines={1}>{user.email}</Text>
              <View style={styles.memberBadge}>
                <Ionicons name="shield-checkmark" size={12} color={Colors.dark.safe} />
                <Text style={styles.memberText}>Member since {memberSince}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Stats row */}
        <Animated.View entering={FadeInDown.duration(400).delay(80)}>
          <View style={styles.statsRow}>
            {[
              { label: "Following QRs", value: stats.followingCount, icon: "notifications" as const, color: Colors.dark.primary },
              { label: "Total Scans", value: stats.scanCount, icon: "scan-outline" as const, color: Colors.dark.accent },
              { label: "Comments", value: stats.commentCount, icon: "chatbubble-outline" as const, color: Colors.dark.safe },
            ].map((s) => (
              <View key={s.label} style={styles.statCard}>
                {statsLoading ? (
                  <ActivityIndicator size="small" color={s.color} />
                ) : (
                  <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                )}
                <Ionicons name={s.icon as any} size={14} color={Colors.dark.textMuted} style={{ marginTop: 2 }} />
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Total Likes card */}
        <Animated.View entering={FadeInDown.duration(400).delay(140)}>
          <View style={styles.likesCard}>
            <View style={styles.likesLeft}>
              <View style={styles.likesIconWrap}>
                <Ionicons name="thumbs-up" size={22} color={Colors.dark.safe} />
              </View>
              <View>
                <Text style={styles.likesTitle}>Total Likes Received</Text>
                <Text style={styles.likesSub}>From your comments across the app</Text>
              </View>
            </View>
            {statsLoading ? (
              <ActivityIndicator size="small" color={Colors.dark.safe} />
            ) : (
              <Text style={styles.likesValue}>{stats.totalLikesReceived}</Text>
            )}
          </View>
        </Animated.View>

        {/* Quick actions */}
        <Animated.View entering={FadeInDown.duration(400).delay(180)}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.card}>
            <Pressable style={styles.menuRow} onPress={() => router.push("/(tabs)/history")}>
              <View style={[styles.menuIcon, { backgroundColor: Colors.dark.primaryDim }]}>
                <Ionicons name="time-outline" size={18} color={Colors.dark.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuRowText}>Scan History</Text>
                <Text style={styles.menuRowSub}>View all your scanned QR codes</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
            </Pressable>
            <View style={styles.cardDivider} />
            <Pressable style={styles.menuRow} onPress={() => router.push("/(tabs)/qr-generator")}>
              <View style={[styles.menuIcon, { backgroundColor: Colors.dark.accentDim }]}>
                <MaterialCommunityIcons name="qrcode-edit" size={18} color={Colors.dark.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuRowText}>Create QR Code</Text>
                <Text style={styles.menuRowSub}>Generate branded or private QR codes</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        </Animated.View>

        {/* Account info */}
        <Animated.View entering={FadeInDown.duration(400).delay(220)}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <View style={[styles.menuIcon, { backgroundColor: Colors.dark.primaryDim }]}>
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
              <View style={[styles.menuIcon, { backgroundColor: Colors.dark.accentDim }]}>
                <Ionicons name="mail-outline" size={18} color={Colors.dark.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{user.email}</Text>
              </View>
              {user.emailVerified ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.dark.safe} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {/* Sign out */}
        <Animated.View entering={FadeInDown.duration(400).delay(280)}>
          <Pressable onPress={handleSignOut} style={styles.signOutBtn}>
            <Ionicons name="log-out-outline" size={20} color={Colors.dark.danger} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* Photo picker modal */}
      <Modal
        visible={photoModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPhotoModalOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPhotoModalOpen(false)}>
          <Pressable style={styles.photoSheet} onPress={() => {}}>
            <View style={styles.photoSheetHandle} />
            <Text style={styles.photoSheetTitle}>Change Profile Photo</Text>
            <Pressable style={styles.photoOption} onPress={() => handlePickPhoto("camera")}>
              <View style={[styles.photoOptionIcon, { backgroundColor: Colors.dark.primaryDim }]}>
                <Ionicons name="camera-outline" size={22} color={Colors.dark.primary} />
              </View>
              <View>
                <Text style={styles.photoOptionText}>Take Photo</Text>
                <Text style={styles.photoOptionSub}>Use your camera</Text>
              </View>
            </Pressable>
            <View style={styles.cardDivider} />
            <Pressable style={styles.photoOption} onPress={() => handlePickPhoto("gallery")}>
              <View style={[styles.photoOptionIcon, { backgroundColor: Colors.dark.accentDim }]}>
                <Ionicons name="images-outline" size={22} color={Colors.dark.accent} />
              </View>
              <View>
                <Text style={styles.photoOptionText}>Choose from Gallery</Text>
                <Text style={styles.photoOptionSub}>Pick an existing photo</Text>
              </View>
            </Pressable>
            <Pressable style={styles.photoCancel} onPress={() => setPhotoModalOpen(false)}>
              <Text style={styles.photoCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  navBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.surfaceBorder,
  },
  navTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.dark.text },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
    alignItems: "center", justifyContent: "center",
  },

  scrollContent: { padding: 20 },

  centeredBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  guestAvatar: {
    width: 96, height: 96, borderRadius: 48,
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

  heroCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
    flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 16,
  },
  avatarWrapper: { position: "relative" },
  avatarLarge: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: Colors.dark.primaryDim, alignItems: "center", justifyContent: "center",
    borderWidth: 2.5, borderColor: Colors.dark.primary,
  },
  avatarLargeImg: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 2.5, borderColor: Colors.dark.primary,
  },
  avatarLargeText: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.dark.primary },
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.dark.primary, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.dark.surface,
  },
  heroInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  displayName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.dark.text, flexShrink: 1 },
  emailText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.dark.textSecondary, marginBottom: 6 },
  memberBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  memberText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.dark.safe },
  editNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  nameInput: {
    flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.dark.text,
    backgroundColor: Colors.dark.surfaceLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.dark.primary,
  },
  saveNameBtn: { backgroundColor: Colors.dark.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  saveNameBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000" },
  cancelNameBtn: { padding: 6 },

  statsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: Colors.dark.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
    padding: 14, alignItems: "center", gap: 4,
  },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.dark.textMuted, textAlign: "center" },

  likesCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.dark.safeDim,
    padding: 16, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 20,
  },
  likesLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  likesIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.dark.safeDim, alignItems: "center", justifyContent: "center",
  },
  likesTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.dark.text },
  likesSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted, marginTop: 2 },
  likesValue: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.dark.safe },

  sectionTitle: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.dark.textMuted,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, marginLeft: 2,
  },
  card: {
    backgroundColor: Colors.dark.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 20, overflow: "hidden",
  },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  menuIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  menuRowText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.dark.text },
  menuRowSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted, marginTop: 2 },
  cardDivider: { height: 1, backgroundColor: Colors.dark.surfaceBorder, marginHorizontal: 16 },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  infoLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.dark.textMuted, marginBottom: 2 },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.dark.text },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  verifiedText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.dark.safe },

  signOutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.dark.dangerDim, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.dark.danger + "30",
  },
  signOutText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.dark.danger },

  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  photoSheet: {
    backgroundColor: Colors.dark.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 36, paddingTop: 12,
    borderTopWidth: 1, borderColor: Colors.dark.surfaceBorder,
  },
  photoSheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.dark.surfaceLight, alignSelf: "center", marginBottom: 16,
  },
  photoSheetTitle: {
    fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.dark.text,
    paddingHorizontal: 20, marginBottom: 12,
  },
  photoOption: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16 },
  photoOptionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  photoOptionText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.dark.text },
  photoOptionSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted, marginTop: 2 },
  photoCancel: {
    margin: 16, backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 14, padding: 16, alignItems: "center",
  },
  photoCancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.dark.textSecondary },
});
