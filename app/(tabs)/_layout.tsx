import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, router } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToNotificationCount } from "@/lib/firestore-service";

function ScanTabButton({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (onPress) onPress();
      }}
      style={styles.scanTabBtn}
      accessibilityLabel="Scan"
      accessibilityRole="button"
    >
      <View style={styles.scanTabBtnInner}>
        <MaterialCommunityIcons name="qrcode-scan" size={28} color="#000" />
      </View>
    </Pressable>
  );
}

function useNotificationCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    const unsub = subscribeToNotificationCount(user.id, setCount);
    return unsub;
  }, [user?.id]);

  return count;
}

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scanner">
        <Icon sf={{ default: "qrcode.viewfinder", selected: "qrcode.viewfinder" }} />
        <Label>Scan</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <Icon sf={{ default: "clock", selected: "clock.fill" }} />
        <Label>History</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const insets = useSafeAreaInsets();
  const notifCount = useNotificationCount();

  const tabBarHeight = isWeb ? 84 : 60 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.dark.primary,
        tabBarInactiveTintColor: Colors.dark.textMuted,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : Colors.dark.surface,
          borderTopWidth: 1,
          borderTopColor: Colors.dark.surfaceBorder,
          elevation: 0,
          height: tabBarHeight,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          overflow: "visible",
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: Colors.dark.surface },
              ]}
            />
          ),
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarBadge: notifCount > 0 ? notifCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: Colors.dark.primary,
            color: "#000",
            fontSize: 10,
            fontFamily: "Inter_700Bold",
            minWidth: 16,
            height: 16,
            borderRadius: 8,
          },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: "",
          tabBarStyle: { display: "none" },
          tabBarButton: (props) => (
            <ScanTabButton onPress={props.onPress as () => void} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "time" : "time-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  scanTabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -28,
  },
  scanTabBtnInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 12,
    borderWidth: 4,
    borderColor: Colors.dark.background,
  },
});
