import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.dark.surface },
        headerTintColor: Colors.dark.text,
        headerTitleStyle: { fontFamily: "Inter_600SemiBold" },
        contentStyle: { backgroundColor: Colors.dark.background },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="login" options={{ title: "Sign In" }} />
      <Stack.Screen name="register" options={{ title: "Create Account" }} />
      <Stack.Screen name="forgot-password" options={{ title: "Reset Password" }} />
    </Stack>
  );
}
