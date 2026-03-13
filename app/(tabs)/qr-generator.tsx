import { useState, useRef } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import QRCode from "react-native-qrcode-svg";

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

export default function QrGeneratorScreen() {
  const insets = useSafeAreaInsets();
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [qrValue, setQrValue] = useState("");
  const [qrSize, setQrSize] = useState(220);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const tabBarHeight = 60 + insets.bottom;

  const displayValue = buildQrContent(selectedPreset, inputValue);

  function handleGenerate() {
    const val = displayValue.trim();
    if (!val) { Alert.alert("Empty", "Please enter some content first."); return; }
    setQrValue(val);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleCopy() {
    if (!qrValue) return;
    await Clipboard.setStringAsync(qrValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Copied", "QR content copied to clipboard.");
  }

  async function handleShare() {
    if (!qrValue) return;
    try {
      await Share.share({ message: qrValue });
    } catch {}
  }

  function handleClear() {
    setInputValue("");
    setQrValue("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.navBar}>
        <Text style={styles.navTitle}>QR Generator</Text>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Preset selector */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={styles.sectionLabel}>Content Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={styles.presetRow}>
              {QR_PRESETS.map((p, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => { setSelectedPreset(idx); setInputValue(""); setQrValue(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={[styles.presetBtn, selectedPreset === idx && styles.presetBtnActive]}
                >
                  <Ionicons
                    name={p.icon as any}
                    size={18}
                    color={selectedPreset === idx ? Colors.dark.primary : Colors.dark.textMuted}
                  />
                  <Text style={[styles.presetBtnText, selectedPreset === idx && styles.presetBtnTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Animated.View>

        {/* Input */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
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

        {/* Generate button */}
        <Animated.View entering={FadeInDown.duration(400).delay(150)}>
          <Pressable
            onPress={handleGenerate}
            disabled={!inputValue.trim()}
            style={({ pressed }) => [styles.generateBtn, { opacity: pressed || !inputValue.trim() ? 0.6 : 1 }]}
          >
            <Ionicons name="qr-code-outline" size={22} color="#000" />
            <Text style={styles.generateBtnText}>Generate QR Code</Text>
          </Pressable>
        </Animated.View>

        {/* QR Code display */}
        {qrValue ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.qrCard}>
            <View style={styles.qrWrapper}>
              <View style={styles.qrContainer}>
                <QRCode
                  value={qrValue}
                  size={qrSize}
                  color={Colors.dark.text}
                  backgroundColor={Colors.dark.surface}
                />
              </View>
            </View>
            <Text style={styles.qrContentPreview} numberOfLines={2}>{qrValue}</Text>

            {/* Size slider row */}
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

            {/* Action buttons */}
            <View style={styles.qrActions}>
              <Pressable onPress={handleCopy} style={styles.qrActionBtn}>
                <Ionicons name="copy-outline" size={20} color={Colors.dark.primary} />
                <Text style={styles.qrActionText}>Copy Content</Text>
              </Pressable>
              <Pressable onPress={handleShare} style={styles.qrActionBtn}>
                <Ionicons name="share-outline" size={20} color={Colors.dark.primary} />
                <Text style={styles.qrActionText}>Share</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={styles.emptyQr}>
            <View style={styles.emptyQrPlaceholder}>
              <Ionicons name="qr-code-outline" size={64} color={Colors.dark.textMuted} />
            </View>
            <Text style={styles.emptyQrText}>Your QR code will appear here</Text>
            <Text style={styles.emptyQrSub}>Enter content above and tap Generate</Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  navBar: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.surfaceBorder,
  },
  navTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.dark.text },
  scrollContent: { padding: 20 },

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
  presetBtnActive: {
    backgroundColor: Colors.dark.primaryDim, borderColor: Colors.dark.primary,
  },
  presetBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.dark.textMuted },
  presetBtnTextActive: { color: Colors.dark.primary },

  inputCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
    paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: "row", alignItems: "flex-start",
    marginBottom: 4,
  },
  textInput: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.dark.text,
    minHeight: 48, maxHeight: 120,
  },
  clearBtn: { padding: 4, marginTop: 4 },
  charCount: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted, textAlign: "right", marginBottom: 16 },

  generateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.dark.primary, borderRadius: 16, paddingVertical: 16,
    marginBottom: 24,
  },
  generateBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#000" },

  qrCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, padding: 20,
    alignItems: "center",
  },
  qrWrapper: { marginBottom: 16 },
  qrContainer: {
    padding: 16, backgroundColor: Colors.dark.surface,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
  },
  qrContentPreview: {
    fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted,
    textAlign: "center", marginBottom: 16, paddingHorizontal: 8,
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
  qrActions: { flexDirection: "row", gap: 12, width: "100%" },
  qrActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.dark.primaryDim, borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.dark.primary + "30",
  },
  qrActionText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.dark.primary },

  emptyQr: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyQrPlaceholder: {
    width: 140, height: 140, borderRadius: 20,
    backgroundColor: Colors.dark.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, borderStyle: "dashed",
  },
  emptyQrText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.dark.textSecondary },
  emptyQrSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted },
});
