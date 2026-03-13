import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Share,
  Alert,
  Image,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "@/contexts/AuthContext";
import { saveGeneratedQr } from "@/lib/firestore-service";

const QR_PRESETS = [
  { label: "Text", icon: "text-outline", placeholder: "Type any text..." },
  { label: "URL", icon: "link-outline", placeholder: "https://example.com" },
  { label: "Email", icon: "mail-outline", placeholder: "email@example.com" },
  { label: "Phone", icon: "call-outline", placeholder: "+1234567890" },
  { label: "WiFi", icon: "wifi-outline", placeholder: "WIFI:T:WPA;S:NetworkName;P:Password;;" },
];

function buildQrContent(type: number, value: string): string {
  if (!value.trim()) return "";
  switch (type) {
    case 1: return value.startsWith("http") ? value : `https://${value}`;
    case 2: return `mailto:${value}`;
    case 3: return `tel:${value}`;
    default: return value;
  }
}

function getContentType(preset: number): string {
  switch (preset) {
    case 1: return "url";
    case 2: return "email";
    case 3: return "phone";
    case 4: return "wifi";
    default: return "text";
  }
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function QrGeneratorScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const svgRef = useRef<any>(null);

  const [selectedPreset, setSelectedPreset] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [qrValue, setQrValue] = useState("");
  const [qrSize, setQrSize] = useState(220);
  const [privateMode, setPrivateMode] = useState(false);
  const [customLogoUri, setCustomLogoUri] = useState<string | null>(null);
  const [generatedUuid, setGeneratedUuid] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const tabBarHeight = 60 + insets.bottom;

  const displayValue = buildQrContent(selectedPreset, inputValue);
  const isBranded = !!user && !privateMode;

  async function handleGenerate() {
    const val = displayValue.trim();
    if (!val) { Alert.alert("Empty", "Please enter some content first."); return; }
    const uuid = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      val + Date.now()
    );
    const shortUuid = uuid.slice(0, 16).toUpperCase().match(/.{1,4}/g)?.join("-") || uuid.slice(0, 16);
    setQrValue(val);
    setGeneratedUuid(isBranded ? shortUuid : null);
    setGeneratedAt(new Date());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (isBranded && user) {
      setSaving(true);
      await saveGeneratedQr(user.id, val, getContentType(selectedPreset), shortUuid, true).catch(() => {});
      setSaving(false);
    }
  }

  async function handlePickCustomLogo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Gallery access is required."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setCustomLogoUri(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  async function handleCopy() {
    if (!qrValue) return;
    await Clipboard.setStringAsync(qrValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Copied!", "QR content copied to clipboard.");
  }

  async function handleShare() {
    if (!qrValue) return;
    try {
      await Share.share({
        message: isBranded
          ? `QR Code created with QR Guard\nContent: ${qrValue}\nID: ${generatedUuid || ""}`
          : qrValue,
        title: "QR Code — QR Guard",
      });
    } catch {}
  }

  function handleClear() {
    setInputValue("");
    setQrValue("");
    setGeneratedUuid(null);
    setGeneratedAt(null);
    setCustomLogoUri(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const logoSource = customLogoUri
    ? { uri: customLogoUri }
    : isBranded
    ? require("../../assets/images/icon.png")
    : undefined;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.navBar}>
        <Text style={styles.navTitle}>QR Generator</Text>
        <Pressable onPress={() => setInfoModalOpen(true)} style={styles.infoBtn}>
          <Ionicons name="information-circle-outline" size={22} color={Colors.dark.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mode toggle */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => { setPrivateMode(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[styles.modeBtn, !privateMode && styles.modeBtnActive]}
            >
              <Ionicons
                name="shield-checkmark"
                size={16}
                color={!privateMode ? Colors.dark.primary : Colors.dark.textMuted}
              />
              <Text style={[styles.modeBtnText, !privateMode && styles.modeBtnTextActive]}>
                {user ? "Branded" : "Standard"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setPrivateMode(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[styles.modeBtn, privateMode && styles.modeBtnPrivate]}
            >
              <Ionicons
                name="eye-off-outline"
                size={16}
                color={privateMode ? "#F8FAFC" : Colors.dark.textMuted}
              />
              <Text style={[styles.modeBtnText, privateMode && styles.modeBtnTextPrivate]}>Private</Text>
            </Pressable>
          </View>

          {!privateMode && user ? (
            <View style={styles.brandedBanner}>
              <Ionicons name="shield-checkmark" size={14} color={Colors.dark.safe} />
              <Text style={styles.brandedBannerText}>
                Your QR will include the QR Guard logo, a unique ID, and be saved to your account
              </Text>
            </View>
          ) : privateMode ? (
            <View style={styles.privateBanner}>
              <Ionicons name="eye-off-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.privateBannerText}>
                No-trace mode — nothing is recorded. Fully local QR code.
              </Text>
            </View>
          ) : (
            <Pressable style={styles.signInPrompt} onPress={() => router.push("/(auth)/login")}>
              <Ionicons name="sparkles-outline" size={14} color={Colors.dark.accent} />
              <Text style={styles.signInPromptText}>
                Sign in to create branded QR codes with your QR Guard identity
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.dark.accent} />
            </Pressable>
          )}
        </Animated.View>

        {/* Content type */}
        <Animated.View entering={FadeInDown.duration(400).delay(80)}>
          <Text style={styles.sectionLabel}>Content Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={styles.presetRow}>
              {QR_PRESETS.map((p, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => { setSelectedPreset(idx); setInputValue(""); setQrValue(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={[styles.presetBtn, selectedPreset === idx && styles.presetBtnActive]}
                >
                  <Ionicons name={p.icon as any} size={16} color={selectedPreset === idx ? Colors.dark.primary : Colors.dark.textMuted} />
                  <Text style={[styles.presetBtnText, selectedPreset === idx && styles.presetBtnTextActive]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Animated.View>

        {/* Input */}
        <Animated.View entering={FadeInDown.duration(400).delay(140)}>
          <Text style={styles.sectionLabel}>Content</Text>
          <View style={styles.inputCard}>
            <TextInput
              style={styles.textInput}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder={QR_PRESETS[selectedPreset].placeholder}
              placeholderTextColor={Colors.dark.textMuted}
              multiline={selectedPreset === 0 || selectedPreset === 4}
              maxLength={500}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {inputValue.length > 0 ? (
              <Pressable onPress={handleClear} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={20} color={Colors.dark.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.charCount}>{inputValue.length}/500</Text>
        </Animated.View>

        {/* Custom logo picker */}
        <Animated.View entering={FadeInDown.duration(400).delay(180)}>
          <Text style={styles.sectionLabel}>Center Logo (Optional)</Text>
          <View style={styles.logoPickerRow}>
            <Pressable onPress={handlePickCustomLogo} style={styles.logoPicker}>
              {customLogoUri ? (
                <Image source={{ uri: customLogoUri }} style={styles.logoPreview} />
              ) : (
                <>
                  <Ionicons name="image-outline" size={20} color={Colors.dark.textMuted} />
                  <Text style={styles.logoPickerText}>Add Logo</Text>
                </>
              )}
            </Pressable>
            {customLogoUri ? (
              <Pressable onPress={() => setCustomLogoUri(null)} style={styles.removeLogoBtn}>
                <Ionicons name="close" size={16} color={Colors.dark.danger} />
                <Text style={styles.removeLogoText}>Remove</Text>
              </Pressable>
            ) : isBranded ? (
              <View style={styles.defaultLogoInfo}>
                <Image source={require("../../assets/images/icon.png")} style={styles.defaultLogoIcon} />
                <Text style={styles.defaultLogoText}>QR Guard logo will be used by default</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Generate button */}
        <Animated.View entering={FadeInDown.duration(400).delay(220)}>
          <Pressable
            onPress={handleGenerate}
            disabled={!inputValue.trim()}
            style={({ pressed }) => [styles.generateBtn, { opacity: pressed || !inputValue.trim() ? 0.6 : 1 }]}
          >
            <MaterialCommunityIcons name="qrcode-edit" size={22} color="#000" />
            <Text style={styles.generateBtnText}>Generate QR Code</Text>
          </Pressable>
        </Animated.View>

        {/* QR display */}
        {qrValue ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.qrCard}>
            {/* QR code */}
            <View style={styles.qrWrapper}>
              <View style={styles.qrBg}>
                <QRCode
                  value={qrValue}
                  size={qrSize}
                  color="#0A0E17"
                  backgroundColor="#F8FAFC"
                  getRef={(ref: any) => { svgRef.current = ref; }}
                  logo={logoSource}
                  logoSize={customLogoUri ? 54 : isBranded ? 48 : undefined}
                  logoBackgroundColor="#F8FAFC"
                  logoBorderRadius={customLogoUri ? 27 : 10}
                  logoMargin={4}
                  quietZone={10}
                  ecl="H"
                />
              </View>
            </View>

            {/* Branded footer */}
            {isBranded && generatedUuid ? (
              <View style={styles.brandedFooter}>
                <View style={styles.brandedHeader}>
                  <Image source={require("../../assets/images/icon.png")} style={styles.brandLogo} />
                  <Text style={styles.brandName}>QR Guard</Text>
                  <View style={styles.secureBadge}>
                    <Ionicons name="shield-checkmark" size={11} color={Colors.dark.safe} />
                    <Text style={styles.secureText}>Verified</Text>
                  </View>
                </View>
                <View style={styles.brandedMeta}>
                  <View style={styles.brandedMetaItem}>
                    <Text style={styles.brandedMetaLabel}>QR ID</Text>
                    <Text style={styles.brandedMetaValue}>{generatedUuid}</Text>
                  </View>
                  <View style={styles.brandedMetaItem}>
                    <Text style={styles.brandedMetaLabel}>Created by</Text>
                    <Text style={styles.brandedMetaValue} numberOfLines={1}>{user?.displayName}</Text>
                  </View>
                  {generatedAt ? (
                    <View style={styles.brandedMetaItem}>
                      <Text style={styles.brandedMetaLabel}>Date</Text>
                      <Text style={styles.brandedMetaValue}>{formatShortDate(generatedAt)}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : privateMode ? (
              <View style={styles.privateFooter}>
                <Ionicons name="eye-off-outline" size={14} color={Colors.dark.textMuted} />
                <Text style={styles.privateFooterText}>No-trace QR — not recorded anywhere</Text>
              </View>
            ) : null}

            <Text style={styles.qrContentPreview} numberOfLines={2}>{qrValue}</Text>

            {/* Size control */}
            <View style={styles.sizeRow}>
              <Text style={styles.sizeLabel}>Size</Text>
              <View style={styles.sizeButtons}>
                <Pressable onPress={() => setQrSize(Math.max(160, qrSize - 20))} style={styles.sizeBtn}>
                  <Ionicons name="remove" size={18} color={Colors.dark.primary} />
                </Pressable>
                <Text style={styles.sizePx}>{qrSize}px</Text>
                <Pressable onPress={() => setQrSize(Math.min(320, qrSize + 20))} style={styles.sizeBtn}>
                  <Ionicons name="add" size={18} color={Colors.dark.primary} />
                </Pressable>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.qrActions}>
              <Pressable onPress={handleCopy} style={styles.qrActionBtn}>
                <Ionicons name="copy-outline" size={19} color={Colors.dark.primary} />
                <Text style={styles.qrActionText}>Copy</Text>
              </Pressable>
              <Pressable onPress={handleShare} style={styles.qrActionBtn}>
                <Ionicons name="share-outline" size={19} color={Colors.dark.primary} />
                <Text style={styles.qrActionText}>Share</Text>
              </Pressable>
              <Pressable onPress={handleClear} style={[styles.qrActionBtn, { borderColor: Colors.dark.danger + "50" }]}>
                <Ionicons name="trash-outline" size={19} color={Colors.dark.danger} />
                <Text style={[styles.qrActionText, { color: Colors.dark.danger }]}>Clear</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={styles.emptyQr}>
            <View style={styles.emptyQrPlaceholder}>
              <MaterialCommunityIcons name="qrcode-scan" size={64} color={Colors.dark.textMuted} />
            </View>
            <Text style={styles.emptyQrText}>Your QR code will appear here</Text>
            <Text style={styles.emptyQrSub}>Enter content above and tap Generate</Text>
          </Animated.View>
        )}
      </ScrollView>

      {/* Info modal */}
      <Modal
        visible={infoModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setInfoModalOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setInfoModalOpen(false)}>
          <Pressable style={styles.infoSheet} onPress={() => {}}>
            <View style={styles.infoSheetHandle} />
            <Text style={styles.infoSheetTitle}>About QR Generation</Text>

            <View style={styles.infoItem}>
              <View style={[styles.infoItemIcon, { backgroundColor: Colors.dark.primaryDim }]}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.dark.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoItemTitle}>Branded QR (Signed In)</Text>
                <Text style={styles.infoItemDesc}>
                  Includes the QR Guard logo, a unique ID, your name, and creation date. Saved to your account for tracking.
                </Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <View style={[styles.infoItemIcon, { backgroundColor: "rgba(100,116,139,0.15)" }]}>
                <Ionicons name="eye-off-outline" size={20} color={Colors.dark.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoItemTitle}>Private / No-Trace QR</Text>
                <Text style={styles.infoItemDesc}>
                  Completely local. No logo, no ID, no data sent or recorded anywhere. Ideal for personal use.
                </Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <View style={[styles.infoItemIcon, { backgroundColor: Colors.dark.accentDim }]}>
                <Ionicons name="image-outline" size={20} color={Colors.dark.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoItemTitle}>Custom Center Logo</Text>
                <Text style={styles.infoItemDesc}>
                  Add your own image or logo to the center of any QR code you generate.
                </Text>
              </View>
            </View>

            <Pressable style={styles.infoClose} onPress={() => setInfoModalOpen(false)}>
              <Text style={styles.infoCloseText}>Got it</Text>
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
  infoBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
    alignItems: "center", justifyContent: "center",
  },
  scrollContent: { padding: 20 },

  modeRow: {
    flexDirection: "row", gap: 10, marginBottom: 10,
  },
  modeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, borderRadius: 14,
    backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
  },
  modeBtnActive: {
    backgroundColor: Colors.dark.primaryDim, borderColor: Colors.dark.primary,
  },
  modeBtnPrivate: {
    backgroundColor: "#1E293B", borderColor: "#334155",
  },
  modeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.dark.textMuted },
  modeBtnTextActive: { color: Colors.dark.primary },
  modeBtnTextPrivate: { color: "#F8FAFC" },

  brandedBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dark.safeDim, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.dark.safe + "40", marginBottom: 20,
  },
  brandedBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.dark.safe },
  privateBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(30,41,59,0.8)", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.dark.surfaceLight, marginBottom: 20,
  },
  privateBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted },
  signInPrompt: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dark.accentDim, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.dark.accent + "40", marginBottom: 20,
  },
  signInPromptText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.dark.accent },

  sectionLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.dark.textMuted,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
  },
  presetRow: { flexDirection: "row", gap: 8, paddingRight: 4 },
  presetBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    backgroundColor: Colors.dark.surface, borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
  },
  presetBtnActive: { backgroundColor: Colors.dark.primaryDim, borderColor: Colors.dark.primary },
  presetBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.dark.textMuted },
  presetBtnTextActive: { color: Colors.dark.primary },

  inputCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
    paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: "row", alignItems: "flex-start", marginBottom: 4,
  },
  textInput: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.dark.text,
    minHeight: 48, maxHeight: 120,
  },
  clearBtn: { padding: 4, marginTop: 4 },
  charCount: { fontSize: 11, color: Colors.dark.textMuted, textAlign: "right", marginBottom: 16 },

  logoPickerRow: {
    flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20,
  },
  logoPicker: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: Colors.dark.surface, borderWidth: 1.5,
    borderColor: Colors.dark.surfaceBorder, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  logoPreview: { width: 60, height: 60, borderRadius: 14 },
  logoPickerText: { fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.dark.textMuted },
  removeLogoBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    backgroundColor: Colors.dark.dangerDim, borderWidth: 1, borderColor: Colors.dark.danger + "40",
  },
  removeLogoText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.dark.danger },
  defaultLogoInfo: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  defaultLogoIcon: { width: 28, height: 28, borderRadius: 8 },
  defaultLogoText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted, flex: 1 },

  generateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.dark.primary, borderRadius: 16, paddingVertical: 16, marginBottom: 24,
  },
  generateBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#000" },

  qrCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, padding: 20, alignItems: "center",
  },
  qrWrapper: { marginBottom: 16 },
  qrBg: {
    backgroundColor: "#F8FAFC", borderRadius: 16, padding: 16,
    shadowColor: Colors.dark.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 8,
  },

  brandedFooter: {
    width: "100%", backgroundColor: Colors.dark.primaryDim,
    borderRadius: 14, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.dark.primary + "40",
  },
  brandedHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  brandLogo: { width: 22, height: 22, borderRadius: 6 },
  brandName: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.dark.primary, flex: 1 },
  secureBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.dark.safeDim, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  secureText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.dark.safe },
  brandedMeta: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  brandedMetaItem: {},
  brandedMetaLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted, marginBottom: 2 },
  brandedMetaValue: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.dark.text, maxWidth: 100 },

  privateFooter: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginBottom: 12,
  },
  privateFooterText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted },

  qrContentPreview: {
    fontSize: 12, color: Colors.dark.textMuted, textAlign: "center",
    marginBottom: 16, paddingHorizontal: 8,
  },
  sizeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    width: "100%", marginBottom: 16,
  },
  sizeLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.dark.textSecondary },
  sizeButtons: { flexDirection: "row", alignItems: "center", gap: 12 },
  sizeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.dark.primaryDim, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.dark.primary + "40",
  },
  sizePx: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.dark.text, minWidth: 52, textAlign: "center" },
  qrActions: { flexDirection: "row", gap: 10, width: "100%" },
  qrActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: Colors.dark.primaryDim, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.dark.primary + "30",
  },
  qrActionText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.dark.primary },

  emptyQr: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyQrPlaceholder: {
    width: 140, height: 140, borderRadius: 20,
    backgroundColor: Colors.dark.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, borderStyle: "dashed",
  },
  emptyQrText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.dark.textSecondary },
  emptyQrSub: { fontSize: 13, color: Colors.dark.textMuted },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  infoSheet: {
    backgroundColor: Colors.dark.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
    borderTopWidth: 1, borderColor: Colors.dark.surfaceBorder,
  },
  infoSheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.dark.surfaceLight, alignSelf: "center", marginBottom: 16,
  },
  infoSheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.dark.text, marginBottom: 20 },
  infoItem: { flexDirection: "row", gap: 14, marginBottom: 18, alignItems: "flex-start" },
  infoItemIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  infoItemTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.dark.text, marginBottom: 4 },
  infoItemDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.dark.textSecondary, lineHeight: 18 },
  infoClose: {
    backgroundColor: Colors.dark.primary, borderRadius: 14, padding: 16, alignItems: "center", marginTop: 8,
  },
  infoCloseText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#000" },
});
