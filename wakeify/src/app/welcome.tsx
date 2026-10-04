import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as repo from '../data/repositories';
import { computeStats } from '../domain/stats';
import { formatTime } from '../domain/schedule';
import type { WakeEvent } from '../domain/types';
import { getActiveRing } from '../services/alarmEngine';
import { getDb } from '../services/database';
import { ringUi } from '../services/ringFlow';
import { useApp } from '../state/AppProvider';
import { Button, FadeIn, Row, Text } from '../ui/components';
import { radius, space, useTheme } from '../ui/theme';

const dateFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Welcome() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const { alarms, settings } = useApp();
  const [event, setEvent] = useState<WakeEvent | null>(null);
  const [streak, setStreak] = useState(0);
  const now = new Date();

  // Another alarm may have started while the previous challenge was solved.
  useEffect(() => {
    const id = setTimeout(() => {
      void getActiveRing().then((r) => {
        if (r && !ringUi.open) {
          ringUi.open = true;
          router.push('/ring');
        }
      });
    }, 800);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const events = await repo.listWakeEvents(db, Date.now() - 400 * 86400000);
      setEvent(events.find((e) => e.id === eventId) ?? null);
      setStreak(computeStats(events, settings.onTimeGraceMinutes, new Date()).currentStreak);
    })();
  }, [eventId, settings.onTimeGraceMinutes]);

  const alarm = alarms.find((a) => a.id === event?.alarmId);
  const message = alarm?.message || settings.affirmation;
  const onTime = event?.dismissedAt != null && event.dismissedAt - event.scheduledFor <= settings.onTimeGraceMinutes * 60000;
  const took = event?.challengeDurationMs != null ? Math.max(1, Math.round(event.challengeDurationMs / 1000)) : null;

  return (
    <LinearGradient
      colors={[t.heroFrom, t.heroTo, t.bg]}
      locations={[0, 0.55, 1]}
      style={{ flex: 1, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl }}
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
        <FadeIn>
          <Ionicons name="sunny" size={48} color="#FFD9A8" />
          <Text variant="overline" color="rgba(255,255,255,0.7)" style={{ marginTop: space.lg }}>
            {dateFmt.format(now)}
          </Text>
          <Text variant="hero" color="#FFFFFF" accessibilityRole="header">
            Dobré ráno.
          </Text>
        </FadeIn>
        <FadeIn delay={150}>
          <Text style={{ fontSize: 22, lineHeight: 31, fontWeight: '300', color: '#FFFFFF' }}>{message}</Text>
        </FadeIn>
        <FadeIn delay={300}>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {[
              event?.dismissedAt ? { icon: 'time-outline' as const, text: `Vzhůru v ${formatTime(new Date(event.dismissedAt).getHours(), new Date(event.dismissedAt).getMinutes())}` } : null,
              event ? { icon: onTime ? ('checkmark-circle-outline' as const) : ('hourglass-outline' as const), text: onTime ? 'Včas' : 'Trochu později' } : null,
              { icon: 'flame-outline' as const, text: `Série ${streak} ${streak === 1 ? 'den' : streak >= 2 && streak <= 4 ? 'dny' : 'dní'}` },
              took ? { icon: 'flash-outline' as const, text: `Úkol za ${took} s` } : null,
            ]
              .filter(Boolean)
              .map((c) => (
                <View
                  key={c!.text}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 36, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.12)' }}
                >
                  <Ionicons name={c!.icon} size={16} color="#FFFFFF" />
                  <Text variant="caption" color="#FFFFFF">
                    {c!.text}
                  </Text>
                </View>
              ))}
          </Row>
        </FadeIn>
      </View>
      <Button title="Začít den" icon="arrow-forward" onPress={() => router.replace('/')} />
    </LinearGradient>
  );
}
