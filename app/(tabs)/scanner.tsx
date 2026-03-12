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

  async function processScan(content: string) {
    setProcessing(true);
    try {
      const baseUrl = getApiUrl();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await globalThis.fetch(`${baseUrl}api/qr/scan`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content, isAnonymous: anonymousMode }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Scan failed");

      if (!anonymousMode) {
        const scanEntry = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          content,
          contentType: data.qrCode?.contentType || "text",
          scannedAt: new Date().toISOString(),
          qrCodeId: data.qrCode?.id,
        };
        const stored = await AsyncStorage.getItem("local_scan_history");
        const history = stored ? JSON.parse(stored) : [];
        history.unshift(scanEntry);
        if (history.length > 100) history.pop();
        await AsyncStorage.setItem("local_scan_history", JSON.stringify(history));
      }

      if (data.qrCode?.id) {
        setScanSuccess(true);
        setProcessing(false);
        // Brief success flash then navigate
        await new Promise((r) => setTimeout(r, 300));
        router.push(`/qr-detail/${data.qrCode.id}`);
      }
    } catch (e: any) {
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
      const data = await res.json();
      if (!res.ok || !data.content) {
        Alert.alert("No QR Found", "No QR code was detected in the selected image");
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
          {permission.status === "denied" && !permission.canAskAgain ? (
            <View style={styles.permDeniedBox}>
              <Ionicons name="information-circle" size={18} color={Colors.dark.warning} />
              <Text style={styles.permDeniedText}>
                Camera permission was denied. Enable it in your device settings.
              </Text>
            </View>
          ) : (
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
          )}
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
  permDeniedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.warningDim,
    padding: 14,
    borderRadius: 12,
    maxWidth: 300,
  },
  permDeniedText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.warning,
    flex: 1,
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
