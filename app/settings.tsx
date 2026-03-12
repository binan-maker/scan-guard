import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  TextInput,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import {
  getUserFollowing,
  getUserComments,
  softDeleteComment,
  submitFeedback,
  deleteUserAccount,
} from "@/lib/firestore-service";

type Section = "main" | "account" | "guide" | "feedback" | "following" | "comments";

export default function SettingsScreen() {
  const { user, token, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<Section>("main");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState(user?.email || "");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [myComments, setMyComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const topInset = Platform.OS === "web" ? 67 : insets.top;

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

  async function handleClearData() {
    Alert.alert(
      "Clear All Data",
      "This will remove all locally stored data including scan history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem("local_scan_history");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText.toLowerCase() !== "delete") {
      Alert.alert("Confirmation Required", 'Please type "delete" to confirm.');
      return;
    }
    try {
      if (user) {
        await deleteUserAccount(user.id);
      }
      await signOut();
      Alert.alert(
        "Account Deleted",
        "Your account has been scheduled for deletion. You have 14 days to contact support to recover it."
      );
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to delete account");
    }
  }

  async function loadFollowing() {
    setFollowingLoading(true);
    try {
      if (user) {
        const list = await getUserFollowing(user.id);
        setFollowingList(list);
      }
    } catch (e) {}
    setFollowingLoading(false);
  }

  async function loadMyComments() {
    setCommentsLoading(true);
    try {
      if (user) {
        const comments = await getUserComments(user.id);
        setMyComments(comments);
      }
    } catch (e) {}
    setCommentsLoading(false);
  }

  async function handleDeleteComment(commentId: string, qrCodeId: string) {
    Alert.alert("Delete Comment", "Remove this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (user) {
              await softDeleteComment(qrCodeId, commentId, user.id);
            }
            setMyComments((prev) => prev.filter((c) => c.id !== commentId));
          } catch (e) {}
        },
      },
    ]);
  }

  async function handleSubmitFeedback() {
    if (!feedbackText.trim()) {
      Alert.alert("Please enter your feedback");
      return;
    }
    setFeedbackSubmitting(true);
    try {
      await submitFeedback(
        user?.id || null,
        feedbackEmail.trim() || null,
        feedbackText.trim()
      );
      setFeedbackDone(true);
      setFeedbackText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", "Failed to submit feedback. Please try again.");
    }
    setFeedbackSubmitting(false);
  }

  function goToSection(s: Section) {
    setSection(s);
    if (s === "following" && followingList.length === 0) loadFollowing();
    if (s === "comments" && myComments.length === 0) loadMyComments();
  }

  if (section !== "main") {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.navBar}>
          <Pressable onPress={() => setSection("main")} style={styles.navBackBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.navTitle}>
            {section === "account" ? "Account Management"
              : section === "guide" ? "How It Works"
              : section === "feedback" ? "Send Feedback"
              : section === "following" ? "Following"
              : "My Comments"}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {section === "account" && <AccountSection
          user={user}
          token={token}
          deleteConfirmText={deleteConfirmText}
          setDeleteConfirmText={setDeleteConfirmText}
          handleDeleteAccount={handleDeleteAccount}
          goToComments={() => goToSection("comments")}
        />}
        {section === "guide" && <GuideSection />}
        {section === "feedback" && <FeedbackSection
          feedbackText={feedbackText}
          setFeedbackText={setFeedbackText}
          feedbackEmail={feedbackEmail}
          setFeedbackEmail={setFeedbackEmail}
          feedbackSubmitting={feedbackSubmitting}
          feedbackDone={feedbackDone}
          handleSubmitFeedback={handleSubmitFeedback}
        />}
        {section === "following" && <FollowingSection
          loading={followingLoading}
          list={followingList}
        />}
        {section === "comments" && <CommentsSection
          loading={commentsLoading}
          comments={myComments}
          onDelete={handleDeleteComment}
        />}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} style={styles.navBackBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.navTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          {user ? (
            <View style={styles.menuGroup}>
              <View style={styles.accountCard}>
                <View style={styles.accountAvatar}>
                  <Text style={styles.accountAvatarText}>
                    {user.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountName}>{user.displayName}</Text>
                  <Text style={styles.accountEmail}>{user.email}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color={Colors.dark.safe} />
              </View>
              <View style={styles.divider} />
              <MenuItem
                icon="person-outline"
                label="Account Management"
                sublabel="Delete account, manage comments"
                onPress={() => goToSection("account")}
              />
              <View style={styles.divider} />
              <MenuItem
                icon="heart-outline"
                label="Following"
                sublabel="QR codes you're tracking"
                onPress={() => goToSection("following")}
              />
            </View>
          ) : (
            <Pressable
              onPress={() => router.push("/(auth)/login")}
              style={({ pressed }) => [styles.signInCard, { opacity: pressed ? 0.9 : 1 }]}
            >
              <View style={styles.signInIcon}>
                <Ionicons name="person-outline" size={24} color={Colors.dark.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.signInTitle}>Sign in to your account</Text>
                <Text style={styles.signInSub}>Access full features — comment, report, sync history</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HELP & INFORMATION</Text>
          <View style={styles.menuGroup}>
            <MenuItem
              icon="book-outline"
              label="Manual Guide"
              sublabel="Step-by-step usage guide"
              onPress={() => goToSection("guide")}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="shield-checkmark-outline"
              label="About Trust Scores"
              sublabel="How safety ratings are calculated"
              onPress={() =>
                Alert.alert(
                  "Trust Scores",
                  "Trust scores are calculated using community reports weighted by confidence. A QR code with more reporters gets a more accurate score. Single-reporter codes show 'Likely Safe' or 'Uncertain' rather than 100% scores."
                )
              }
            />
            <View style={styles.divider} />
            <MenuItem
              icon="chatbubble-outline"
              label="Send Feedback"
              sublabel="Report bugs or suggest features"
              onPress={() => goToSection("feedback")}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DATA</Text>
          <View style={styles.menuGroup}>
            <MenuItem
              icon="trash-outline"
              label="Clear Local Data"
              sublabel="Remove scan history from this device"
              onPress={handleClearData}
              danger
            />
          </View>
        </View>

        {user ? (
          <View style={styles.section}>
            <Pressable
              onPress={handleSignOut}
              style={({ pressed }) => [styles.signOutBtn, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Ionicons name="log-out-outline" size={20} color={Colors.dark.danger} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerText}>QR Guard v1.0.0</Text>
          <Text style={styles.footerSubtext}>Scan smart. Stay safe.</Text>
        </View>

        <View style={{ height: Platform.OS === "web" ? 34 : insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
}

function AccountSection({ user, token, deleteConfirmText, setDeleteConfirmText, handleDeleteAccount, goToComments }: any) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
    >
      <Animated.View entering={FadeInDown.duration(300)}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MY CONTENT</Text>
          <View style={styles.menuGroup}>
            <MenuItem
              icon="chatbubble-ellipses-outline"
              label="My Comments"
              sublabel="View and delete your comments"
              onPress={goToComments}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DANGER ZONE</Text>
          <View style={[styles.menuGroup, { borderColor: Colors.dark.danger + "40" }]}>
            <View style={{ padding: 16, gap: 12 }}>
              <View style={styles.warningBanner}>
                <Ionicons name="warning" size={20} color={Colors.dark.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningTitle}>Delete Account</Text>
                  <Text style={styles.warningDesc}>
                    Your account will be scheduled for deletion. Comments will be hidden immediately. You have 14 days to contact support to recover it.
                  </Text>
                </View>
              </View>
              <Text style={styles.confirmLabel}>Type "delete" to confirm:</Text>
              <TextInput
                style={styles.confirmInput}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder="delete"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
              />
              <Pressable
                onPress={handleDeleteAccount}
                disabled={deleteConfirmText.toLowerCase() !== "delete"}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  {
                    opacity:
                      deleteConfirmText.toLowerCase() !== "delete" ? 0.4 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Ionicons name="trash" size={18} color="#fff" />
                <Text style={styles.deleteBtnText}>Delete My Account</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

function GuideSection() {
  const insets = useSafeAreaInsets();
  const steps = [
    { icon: "scan-outline", title: "Scan a QR Code", desc: "Point your camera at any QR code, or pick an image from your gallery. The app will automatically detect and analyze the QR code." },
    { icon: "shield-checkmark-outline", title: "Check Trust Score", desc: "View the community trust score powered by reports from other users. Scores are confidence-weighted — more reporters means more accuracy." },
    { icon: "people-outline", title: "Read Community Reports", desc: "See how others have reported the QR code: Safe, Scam, Fake, or Spam. Read comments for detailed insights." },
    { icon: "flag-outline", title: "Report & Protect", desc: "Sign in to report suspicious QR codes and protect the community. Your reports contribute to the trust score algorithm." },
    { icon: "chatbubble-outline", title: "Comment & Discuss", desc: "Add comments to share your experience. Like helpful comments, report harmful ones. Full threading support." },
    { icon: "heart-outline", title: "Follow & Favorites", desc: "Follow QR codes to track them over time. Add frequently used QR codes to favorites for quick access." },
    { icon: "eye-off-outline", title: "Anonymous Mode", desc: "Scan in anonymous mode to prevent your scan from being recorded. Useful for privacy-sensitive QR codes." },
    { icon: "phone-portrait-outline", title: "Payment QR Codes", desc: "For UPI, Google Pay, PhonePe, and other payment QR codes, tap 'Open in Payment App' to pay securely." },
  ];
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
    >
      {steps.map((step, i) => (
        <Animated.View key={i} entering={FadeInDown.duration(300).delay(i * 50)}>
          <View style={styles.guideStep}>
            <View style={styles.guideStepNum}>
              <Text style={styles.guideStepNumText}>{i + 1}</Text>
            </View>
            <View style={styles.guideStepIcon}>
              <Ionicons name={step.icon as any} size={22} color={Colors.dark.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.guideStepTitle}>{step.title}</Text>
              <Text style={styles.guideStepDesc}>{step.desc}</Text>
            </View>
          </View>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

function FeedbackSection({ feedbackText, setFeedbackText, feedbackEmail, setFeedbackEmail, feedbackSubmitting, feedbackDone, handleSubmitFeedback }: any) {
  const insets = useSafeAreaInsets();
  if (feedbackDone) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <View style={[styles.guideStepIcon, { width: 72, height: 72, borderRadius: 36 }]}>
          <Ionicons name="checkmark-circle" size={40} color={Colors.dark.safe} />
        </View>
        <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.dark.text, textAlign: "center" }}>
          Thank you!
        </Text>
        <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.dark.textSecondary, textAlign: "center" }}>
          Your feedback has been submitted. We appreciate you helping improve QR Guard.
        </Text>
      </View>
    );
  }
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
    >
      <Text style={styles.feedbackIntro}>
        Found a bug? Have a feature idea? We'd love to hear from you.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Email (optional)</Text>
        <TextInput
          style={styles.textInput}
          value={feedbackEmail}
          onChangeText={setFeedbackEmail}
          placeholder="your@email.com"
          placeholderTextColor={Colors.dark.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Your Feedback *</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={feedbackText}
          onChangeText={setFeedbackText}
          placeholder="Tell us what's on your mind..."
          placeholderTextColor={Colors.dark.textMuted}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          maxLength={1000}
        />
        <Text style={styles.charCount}>{feedbackText.length}/1000</Text>
      </View>

      <Pressable
        onPress={handleSubmitFeedback}
        disabled={feedbackSubmitting || !feedbackText.trim()}
        style={({ pressed }) => [
          styles.submitBtn,
          { opacity: feedbackSubmitting || !feedbackText.trim() ? 0.5 : pressed ? 0.8 : 1 },
        ]}
      >
        {feedbackSubmitting ? (
          <ActivityIndicator color="#000" />
        ) : (
          <>
            <Ionicons name="send" size={18} color="#000" />
            <Text style={styles.submitBtnText}>Submit Feedback</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

function FollowingSection({ loading, list }: { loading: boolean; list: any[] }) {
  const insets = useSafeAreaInsets();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={Colors.dark.primary} size="large" />
      </View>
    );
  }
  if (list.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
        <Ionicons name="heart-outline" size={48} color={Colors.dark.textMuted} />
        <Text style={{ fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.dark.textSecondary }}>
          Not following anything yet
        </Text>
        <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted, textAlign: "center" }}>
          Follow QR codes on the detail screen to track them here
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      data={list}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push({ pathname: "/qr-detail/[id]", params: { id: item.qrCodeId } })}
          style={({ pressed }) => [styles.followItem, { opacity: pressed ? 0.8 : 1 }]}
        >
          <View style={styles.followIcon}>
            <Ionicons name="qr-code-outline" size={20} color={Colors.dark.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.followContent} numberOfLines={1}>{item.content || item.qrCodeId}</Text>
            <Text style={styles.followType}>{item.contentType?.toUpperCase() || "QR CODE"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
        </Pressable>
      )}
    />
  );
}

function CommentsSection({ loading, comments, onDelete }: { loading: boolean; comments: any[]; onDelete: (id: string, qrCodeId: string) => void }) {
  const insets = useSafeAreaInsets();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={Colors.dark.primary} size="large" />
      </View>
    );
  }
  if (comments.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
        <Ionicons name="chatbubble-outline" size={48} color={Colors.dark.textMuted} />
        <Text style={{ fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.dark.textSecondary }}>
          No comments yet
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      data={comments}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
      renderItem={({ item }) => (
        <View style={styles.myCommentItem}>
          <Text style={styles.myCommentText}>{item.text}</Text>
          <View style={styles.myCommentMeta}>
            <Text style={styles.myCommentDate}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
            <Pressable
              onPress={() => onDelete(item.id, item.qrCodeId)}
              style={styles.deleteCommentBtn}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.dark.danger} />
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}

function MenuItem({
  icon,
  label,
  sublabel,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons
        name={icon as any}
        size={22}
        color={danger ? Colors.dark.danger : Colors.dark.textSecondary}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuLabel, danger && { color: Colors.dark.danger }]}>{label}</Text>
        {sublabel ? <Text style={styles.menuSublabel}>{sublabel}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.text,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
    paddingLeft: 4,
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
  },
  accountAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.dark.primaryDim,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  accountAvatarText: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.primary,
  },
  accountName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.text,
  },
  accountEmail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  signInCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.dark.surface,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.surfaceBorder,
  },
  signInIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.dark.primaryDim,
    alignItems: "center",
    justifyContent: "center",
  },
  signInTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.text,
  },
  signInSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  menuGroup: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.surfaceBorder,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  menuLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.dark.text,
  },
  menuSublabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.surfaceBorder,
    marginLeft: 52,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.dark.dangerDim,
    paddingVertical: 16,
    borderRadius: 14,
  },
  signOutText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.danger,
  },
  footer: {
    alignItems: "center",
    gap: 4,
    marginTop: 20,
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.textMuted,
  },
  footerSubtext: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textMuted,
  },
  warningBanner: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: Colors.dark.dangerDim,
    padding: 14,
    borderRadius: 12,
  },
  warningTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.danger,
    marginBottom: 4,
  },
  warningDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  confirmLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.dark.textSecondary,
  },
  confirmInput: {
    backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.dark.text,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.dark.danger,
    paddingVertical: 14,
    borderRadius: 12,
  },
  deleteBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  guideStep: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
    marginBottom: 20,
    backgroundColor: Colors.dark.surface,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.surfaceBorder,
  },
  guideStepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.dark.primaryDim,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  guideStepNumText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.primary,
  },
  guideStepIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.dark.primaryDim,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 0,
  },
  guideStepTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.text,
    marginBottom: 6,
  },
  guideStepDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  feedbackIntro: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    marginBottom: 24,
    lineHeight: 22,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.textSecondary,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.text,
  },
  textArea: {
    height: 140,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textMuted,
    textAlign: "right",
    marginTop: 4,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.dark.primary,
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
  followItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.dark.surface,
    padding: 16,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.dark.surfaceBorder,
  },
  followIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.dark.primaryDim,
    alignItems: "center",
    justifyContent: "center",
  },
  followContent: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.dark.text,
  },
  followType: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  myCommentItem: {
    backgroundColor: Colors.dark.surface,
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.dark.surfaceBorder,
  },
  myCommentText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.text,
    lineHeight: 20,
    marginBottom: 10,
  },
  myCommentMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  myCommentDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textMuted,
  },
  deleteCommentBtn: {
    padding: 4,
  },
});
