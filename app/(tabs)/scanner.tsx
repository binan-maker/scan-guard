import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  StatusBar,
  Animated,
  Easing,
  Linking,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { router, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import Reanimated, { FadeIn, FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { getOrCreateQrCode, recordScan } from "@/lib/firestore-service";
import {
  parseUpiQr,
  analyzePaymentQr,
  analyzeUrlHeuristics,
  loadOfflineBlacklist,
  checkOfflineBlacklist,
} from "@/lib/qr-analysis";

const FINDER_SIZE = 270;
const CORNER_SIZE = 32;
const CORNER_WIDTH = 4;

const ZOOM_LEVELS = [
  { zoom: 0, label: "1×" },
  { zoom: 0.3, label: "2×" },
  { zoom: 0.6, label: "3×" },
];

export default function ScannerScreen() {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [zoomLabel, setZoomLabel] = useState("1×");

  // Safety interstitial state
  const [safetyModal, setSafetyModal] = useState(false);
  const [pendingQrId, setPendingQrId] = useState<string | null>(null);
  const [safetyWarnings, setSafetyWarnings] = useState<string[]>([]);
  const [safetyRiskLevel, setSafetyRiskLevel] = useState<"caution" | "dangerous">("caution");

  const scanLockRef = useRef(false);
  const canScanRef = useRef(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animated scan line
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const scanLineLoop = useRef<Animated.CompositeAnimation | null>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  function startScanLine() {
    scanLineAnim.setValue(0);
    scanLineLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    scanLineLoop.current.start();
  }

  function stopScanLine() {
    if (scanLineLoop.current) {
      scanLineLoop.current.stop();
    }
  }

  useEffect(() => {
    startScanLine();
    return () => stopScanLine();
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Full reset when screen comes into focus
      setScanned(false);
      setProcessing(false);
      setScanSuccess(false);
      scanLockRef.current = false;
      canScanRef.current = false;
      startScanLine();

      // Delay enabling scan to prevent immediate re-trigger
      focusTimerRef.current = setTimeout(() => {
        canScanRef.current = true;
      }, 500);

      return () => {
        if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        canScanRef.current = false;
        stopScanLine();
      };
    }, [])
  );

  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (!canScanRef.current || scanLockRef.current || scanned) return;
      scanLockRef.current = true;
      canScanRef.current = false;
      setScanned(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await processScan(data);
    },
    [scanned, anonymousMode, token]
  );

  async function runSafetyCheck(content: string, contentType: string): Promise<{ riskLevel: "safe" | "caution" | "dangerous"; warnings: string[] }> {
    const warnings: string[] = [];
    let riskLevel: "safe" | "caution" | "dangerous" = "safe";

    // Offline blacklist check
    const blacklist = await loadOfflineBlacklist();
    const blMatch = checkOfflineBlacklist(content, blacklist);
    if (blMatch.matched) {
      warnings.push(`Known scam pattern: ${blMatch.reason}`);
      riskLevel = "dangerous";
    }

    // Payment QR check
    if (contentType === "payment") {
      const parsed = parseUpiQr(content);
      if (parsed) {
        const result = analyzePaymentQr(parsed);
        warnings.push(...result.warnings);
        if (result.riskLevel === "dangerous") riskLevel = "dangerous";
        else if (result.riskLevel === "caution" && riskLevel === "safe") riskLevel = "caution";
      }
    }

    // URL heuristic check
    if (contentType === "url") {
      try {
        const result = analyzeUrlHeuristics(content);
        warnings.push(...result.warnings);
        if (result.riskLevel === "dangerous") riskLevel = "dangerous";
        else if (result.riskLevel === "caution" && riskLevel === "safe") riskLevel = "caution";
      } catch {}
    }

    return { riskLevel, warnings };
  }

  async function processScan(content: string) {
    setProcessing(true);
    try {
      const qr = await getOrCreateQrCode(content);

      // Always save for offline fallback regardless of anonymous mode
      await AsyncStorage.setItem(`qr_content_${qr.id}`, JSON.stringify({
        content: qr.content,
        contentType: qr.contentType,
      }));

      await recordScan(qr.id, content, qr.contentType, user?.id || null, anonymousMode).catch(() => {});

      if (!anonymousMode) {
        const scanEntry = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          content,
          contentType: qr.contentType,
          scannedAt: new Date().toISOString(),
          qrCodeId: qr.id,
        };
        const stored = await AsyncStorage.getItem("local_scan_history");
        const history = stored ? JSON.parse(stored) : [];
        history.unshift(scanEntry);
        if (history.length > 100) history.pop();
        await AsyncStorage.setItem("local_scan_history", JSON.stringify(history));
      }

      setProcessing(false);

      // Run instant safety analysis
      const { riskLevel, warnings } = await runSafetyCheck(content, qr.contentType);

      if (riskLevel !== "safe" && warnings.length > 0) {
        // Show safety interstitial
        setPendingQrId(qr.id);
        setSafetyWarnings(warnings);
        setSafetyRiskLevel(riskLevel as "caution" | "dangerous");
        setSafetyModal(true);
        Haptics.notificationAsync(
          riskLevel === "dangerous"
            ? Haptics.NotificationFeedbackType.Error
            : Haptics.NotificationFeedbackType.Warning
        );
      } else {
        setScanSuccess(true);
        await new Promise((r) => setTimeout(r, 300));
        router.push(`/qr-detail/${qr.id}`);
      }
    } catch (e: any) {
      // Even if Firebase fails (offline), we can still navigate with local data
      try {
        const { detectContentType, getQrCodeId } = await import("@/lib/firestore-service");
        const contentType = detectContentType(content);
        const qrId = await getQrCodeId(content);
        await AsyncStorage.setItem(`qr_content_${qrId}`, JSON.stringify({ content, contentType }));

        setProcessing(false);
        const { riskLevel, warnings } = await runSafetyCheck(content, contentType);
        if (riskLevel !== "safe" && warnings.length > 0) {
          setPendingQrId(qrId);
          setSafetyWarnings(warnings);
          setSafetyRiskLevel(riskLevel as "caution" | "dangerous");
          setSafetyModal(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          setScanSuccess(true);
          await new Promise((r) => setTimeout(r, 300));
          router.push(`/qr-detail/${qrId}`);
        }
        return;
      } catch {}

      Alert.alert("Scan Failed", e.message || "Could not process QR code. Please try again.", [
        { text: "OK", onPress: () => {
          setScanned(false);
          setProcessing(false);
          setScanSuccess(false);
          scanLockRef.current = false;
          canScanRef.current = true;
        }},
      ]);
    } finally {
      setProcessing(false);
    }
  }

  function handleSafetyModalProceed() {
    if (!pendingQrId) return;
    setSafetyModal(false);
    setScanSuccess(true);
    router.push(`/qr-detail/${pendingQrId}`);
  }

  function handleSafetyModalBack() {
    setSafetyModal(false);
    setPendingQrId(null);
    setSafetyWarnings([]);
    setScanned(false);
    setProcessing(false);
    setScanSuccess(false);
    scanLockRef.current = false;
    canScanRef.current = true;
  }

  async function handlePickImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;
      setProcessing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let base64 = result.assets[0].base64;
      if (!base64 && result.assets[0].uri) {
        base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      if (!base64) {
        Alert.alert("Error", "Could not read image");
        setProcessing(false);
        return;
      }

      const baseUrl = getApiUrl();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await globalThis.fetch(`${baseUrl}api/qr/decode-image`, {
        method: "POST",
        headers,
        body: JSON.stringify({ imageBase64: base64 }),
      });

      // Guard against HTML error pages (e.g. payload too large, CORS error)
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        Alert.alert("No QR Found", "No QR code was detected in the selected image");
        setProcessing(false);
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.content) {
        Alert.alert("No QR Found", data.message || "No QR code was detected in the selected image");
        setProcessing(false);
        return;
      }
      await processScan(data.content);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to process image");
      setProcessing(false);
    }
  }

  function cycleZoom() {
    const currentIdx = ZOOM_LEVELS.findIndex((z) => z.zoom === zoom);
    const next = ZOOM_LEVELS[(currentIdx + 1) % ZOOM_LEVELS.length];
    setZoom(next.zoom);
    setZoomLabel(next.label);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <ActivityIndicator color={Colors.dark.primary} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Reanimated.View entering={FadeIn.duration(400)} style={styles.permissionBox}>
          <View style={styles.permIconCircle}>
            <Ionicons name="camera" size={48} color={Colors.dark.primary} />
          </View>
          <Text style={styles.permTitle}>Camera Access Required</Text>
          <Text style={styles.permSubtitle}>
            Allow camera access to scan QR codes instantly
          </Text>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              requestPermission();
            }}
            style={({ pressed }) => [styles.permButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="camera" size={20} color="#000" />
            <Text style={styles.permButtonText}>Enable Camera</Text>
          </Pressable>

          {!permission.canAskAgain ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openSettings();
              }}
              style={({ pressed }) => [styles.openSettingsBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="settings-outline" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.openSettingsText}>Open App Settings</Text>
            </Pressable>
          ) : null}

          <Text style={styles.orText}>or</Text>
          <Pressable
            onPress={handlePickImage}
            style={({ pressed }) => [styles.galleryAltBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="images" size={20} color={Colors.dark.primary} />
            <Text style={styles.galleryAltText}>Pick from Gallery</Text>
          </Pressable>
        </Reanimated.View>
      </View>
    );
  }

  const scanLineY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, FINDER_SIZE - 2],
  });

  return (
    <View style={styles.container}>
      {Platform.OS !== "web" && <StatusBar hidden />}

      {/* Full screen camera */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={flashOn}
        zoom={zoom}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Dark overlay: top */}
      <View style={[styles.dimZone, styles.dimTop, { height: topInset + 56 + (FINDER_SIZE / 2 > 180 ? (300 - FINDER_SIZE) / 2 : 60) }]} />

      {/* Middle row: dim | finder | dim */}
      <View style={styles.middleRow}>
        <View style={styles.dimSide} />

        {/* Finder frame */}
        <View style={styles.finderWrapper}>
          {/* Corner brackets */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />

          {/* Animated scan line */}
          {!scanned && (
            <Animated.View
              style={[
                styles.scanLine,
                { transform: [{ translateY: scanLineY }] },
              ]}
            />
          )}

          {/* Success overlay */}
          {scanSuccess && (
            <View style={styles.successOverlay}>
              <View style={styles.successCircle}>
                <Ionicons name="checkmark" size={40} color="#000" />
              </View>
            </View>
          )}
        </View>

        <View style={styles.dimSide} />
      </View>

      {/* Dark overlay: bottom */}
      <View style={[styles.dimZone, { flex: 1 }]} />

      {/* UI controls on top */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.topBarBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <View style={styles.topCenter}>
            <Text style={styles.scanTitle}>QR Guard</Text>
            <Text style={styles.scanSubtitle}>Point at any QR code</Text>
          </View>
          <Pressable
            onPress={() => {
              setFlashOn(!flashOn);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={[styles.topBarBtn, flashOn && styles.topBarBtnActive]}
          >
            <Ionicons
              name={flashOn ? "flash" : "flash-off"}
              size={22}
              color={flashOn ? Colors.dark.primary : "#fff"}
            />
          </Pressable>
        </View>

        {/* Center hint */}
        <View style={styles.centerHint}>
          <View style={styles.finderSpacer} />
          <Text style={styles.hintText}>
            {scanned && !scanSuccess ? "Processing..." : "Align QR code to scan"}
          </Text>
        </View>

        {/* Bottom controls */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
          {/* Zoom pill */}
          <Pressable onPress={cycleZoom} style={styles.zoomPill}>
            <MaterialCommunityIcons name="magnify" size={16} color={Colors.dark.primary} />
            <Text style={styles.zoomPillText}>{zoomLabel}</Text>
          </Pressable>

          {/* Anonymous toggle */}
          {user ? (
            <Pressable
              onPress={() => {
                setAnonymousMode(!anonymousMode);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={[styles.anonToggle, anonymousMode && styles.anonToggleActive]}
            >
              <Ionicons
                name={anonymousMode ? "eye-off" : "eye"}
                size={16}
                color={anonymousMode ? Colors.dark.warning : "rgba(255,255,255,0.8)"}
              />
              <Text style={[styles.anonText, anonymousMode && { color: Colors.dark.warning }]}>
                {anonymousMode ? "Anonymous" : "Tracked"}
              </Text>
            </Pressable>
          ) : null}

          {/* Bottom action row */}
          <View style={styles.bottomActions}>
            <Pressable
              onPress={handlePickImage}
              style={({ pressed }) => [styles.sideActionBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={styles.sideActionCircle}>
                <Ionicons name="images-outline" size={24} color="#fff" />
              </View>
              <Text style={styles.sideActionLabel}>Gallery</Text>
            </Pressable>

            {/* Center scan indicator */}
            <View style={styles.centerAction}>
              {scanned ? (
                <Pressable
                  onPress={() => {
                    setScanned(false);
                    setScanSuccess(false);
                    setProcessing(false);
                    scanLockRef.current = false;
                    canScanRef.current = true;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                  style={styles.rescanRing}
                >
                  <Ionicons name="refresh" size={28} color={Colors.dark.primary} />
                </Pressable>
              ) : (
                <View style={styles.readyRing}>
                  <View style={styles.readyDot} />
                </View>
              )}
            </View>

            <Pressable
              onPress={() => router.push("/(auth)/login")}
              style={({ pressed }) => [styles.sideActionBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              {user ? (
                <>
                  <View style={styles.sideActionCircle}>
                    <Ionicons name="person" size={22} color={Colors.dark.primary} />
                  </View>
                  <Text style={[styles.sideActionLabel, { color: Colors.dark.primary }]}>
                    {formatFirstName(user.displayName)}
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.sideActionCircle}>
                    <Ionicons name="person-outline" size={22} color="#fff" />
                  </View>
                  <Text style={styles.sideActionLabel}>Sign In</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Processing overlay */}
      {processing ? (
        <View style={styles.processingOverlay}>
          <Reanimated.View entering={FadeIn.duration(200)} style={styles.processingBox}>
            <ActivityIndicator color={Colors.dark.primary} size="large" />
            <Text style={styles.processingTitle}>Analyzing QR Code</Text>
            <Text style={styles.processingSubtitle}>Checking trust score & community reports...</Text>
          </Reanimated.View>
        </View>
      ) : null}

      {/* Safety Interstitial Modal */}
      {safetyModal ? (
        <View style={styles.safetyOverlay}>
          <Reanimated.View entering={FadeInDown.duration(350)} style={styles.safetySheet}>
            {/* Risk badge */}
            <View style={[
              styles.safetyBadge,
              { backgroundColor: safetyRiskLevel === "dangerous" ? Colors.dark.dangerDim : Colors.dark.warningDim },
            ]}>
              <Ionicons
                name={safetyRiskLevel === "dangerous" ? "warning" : "alert-circle"}
                size={32}
                color={safetyRiskLevel === "dangerous" ? Colors.dark.danger : Colors.dark.warning}
              />
            </View>

            <Text style={[
              styles.safetyTitle,
              { color: safetyRiskLevel === "dangerous" ? Colors.dark.danger : Colors.dark.warning },
            ]}>
              {safetyRiskLevel === "dangerous" ? "Danger Detected" : "Caution Advised"}
            </Text>
            <Text style={styles.safetySubtitle}>
              {safetyRiskLevel === "dangerous"
                ? "This QR code shows strong signs of being a scam or phishing attempt."
                : "This QR code has some suspicious characteristics. Proceed carefully."}
            </Text>

            {/* Warnings list */}
            <View style={styles.safetyWarningsList}>
              {safetyWarnings.map((w, i) => (
                <View key={i} style={styles.safetyWarningItem}>
                  <Ionicons name="ellipse" size={6} color={Colors.dark.warning} style={{ marginTop: 6 }} />
                  <Text style={styles.safetyWarningText}>{w}</Text>
                </View>
              ))}
            </View>

            {/* Actions */}
            <Pressable
              onPress={handleSafetyModalBack}
              style={styles.safetyBackBtn}
            >
              <Ionicons name="arrow-back" size={18} color="#000" />
              <Text style={styles.safetyBackBtnText}>Go Back (Recommended)</Text>
            </Pressable>
            <Pressable
              onPress={handleSafetyModalProceed}
              style={styles.safetyProceedBtn}
            >
              <Text style={styles.safetyProceedBtnText}>View Details Anyway</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          </Reanimated.View>
        </View>
      ) : null}
    </View>
  );
}

function formatFirstName(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts[0].length > 10 ? parts[0].substring(0, 9) + "…" : parts[0];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  dimZone: {
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  dimTop: {
    width: "100%",
  },
  middleRow: {
    flexDirection: "row",
    height: FINDER_SIZE,
  },
  dimSide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  finderWrapper: {
    width: FINDER_SIZE,
    height: FINDER_SIZE,
    overflow: "hidden",
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0, left: 0,
    borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH,
    borderTopColor: Colors.dark.primary, borderLeftColor: Colors.dark.primary,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: 0, right: 0,
    borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH,
    borderTopColor: Colors.dark.primary, borderRightColor: Colors.dark.primary,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: 0, left: 0,
    borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH,
    borderBottomColor: Colors.dark.primary, borderLeftColor: Colors.dark.primary,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: 0, right: 0,
    borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH,
    borderBottomColor: Colors.dark.primary, borderRightColor: Colors.dark.primary,
    borderBottomRightRadius: 10,
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.dark.primary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    opacity: 0.9,
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  topBarBtnActive: {
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    borderColor: Colors.dark.primary,
  },
  topCenter: {
    alignItems: "center",
  },
  scanTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.5,
  },
  scanSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    marginTop: 2,
  },
  centerHint: {
    alignItems: "center",
    paddingTop: 16,
  },
  finderSpacer: {
    height: FINDER_SIZE,
  },
  hintText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.65)",
    marginTop: 12,
    letterSpacing: 0.3,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 16,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  zoomPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
  },
  zoomPillText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.primary,
    minWidth: 22,
    textAlign: "center",
  },
  anonToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  anonToggleActive: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  anonText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.8)",
  },
  bottomActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 8,
  },
  sideActionBtn: {
    alignItems: "center",
    gap: 6,
    minWidth: 72,
  },
  sideActionCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  sideActionLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.65)",
  },
  centerAction: {
    alignItems: "center",
    justifyContent: "center",
    width: 80,
    height: 80,
  },
  readyRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2.5,
    borderColor: "rgba(0, 212, 255, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  readyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.primary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  rescanRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2.5,
    borderColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 212, 255, 0.08)",
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "center",
    alignItems: "center",
  },
  processingBox: {
    backgroundColor: Colors.dark.surface,
    padding: 36,
    borderRadius: 24,
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.15)",
    maxWidth: 280,
  },
  processingTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.text,
  },
  processingSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  safetyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  safetySheet: {
    width: "100%",
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 48,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  safetyBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  safetyTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  safetySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 4,
  },
  safetyWarningsList: {
    width: "100%",
    backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  safetyWarningItem: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  safetyWarningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    lineHeight: 19,
  },
  safetyBackBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.dark.warning,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 4,
  },
  safetyBackBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
  safetyProceedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
  },
  safetyProceedBtnText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textMuted,
  },
  permissionBox: {
    flex: 1,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  permIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.primaryDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  permTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.text,
    textAlign: "center",
  },
  permSubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
    textAlign: "center",
    maxWidth: 280,
  },
  permButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  permButtonText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
  openSettingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.surfaceBorder,
  },
  openSettingsText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.dark.textSecondary,
  },
  orText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.dark.textMuted,
  },
  galleryAltBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.dark.primaryDim,
  },
  galleryAltText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.primary,
  },
});
