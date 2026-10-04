import { Stack, router, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getActiveRing, onRingStarted } from '../services/alarmEngine';
import { AppProvider, useApp } from '../state/AppProvider';
import { ThemeContext, dark, light } from '../ui/theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemeGate({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const { settings, ready } = useApp();
  const pref = settings.theme === 'system' ? (system ?? 'dark') : settings.theme;
  const palette = pref === 'light' ? light : dark;
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.bg).catch(() => {});
  }, [palette.bg]);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  return (
    <ThemeContext.Provider value={palette}>
      <StatusBar style={palette.scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Whenever an alarm is ringing, the ring screen must be on top — whether the
 * app was cold-started by the full-screen intent, resumed from background or
 * was already open. The native engine is the source of truth.
 */
function RingWatcher() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const { ready, settings } = useApp();
  const onboardingDone = settings.onboardingDone;

  useEffect(() => {
    if (!ready) return;
    const check = async () => {
      const ring = await getActiveRing();
      if (ring && pathRef.current !== '/ring') router.push('/ring');
    };
    void check();
    const offRing = onRingStarted(() => {
      if (pathRef.current !== '/ring') router.push('/ring');
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => {
      offRing();
      sub.remove();
    };
  }, [ready]);

  useEffect(() => {
    if (ready && !onboardingDone && pathRef.current === '/') router.push('/permissions?onboarding=1');
  }, [ready, onboardingDone]);

  return null;
}

function RootStack() {
  return (
    <ThemeGate>
      <RingWatcher />
      <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="alarm/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="ring" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="welcome" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="permissions" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="targets/photo" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="targets/qr" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
    </ThemeGate>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <RootStack />
      </AppProvider>
    </SafeAreaProvider>
  );
}
