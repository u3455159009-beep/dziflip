import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, View } from 'react-native';

import { planSummary } from '../../domain/rotation';
import { describeRepeat, formatCountdown, formatTime, nextOccurrence, relativeDayLabel, soonest } from '../../domain/schedule';
import type { Alarm } from '../../domain/types';
import { engineAvailable, getPermissionStatus } from '../../services/alarmEngine';
import { useApp } from '../../state/AppProvider';
import { Button, Card, Chip, EmptyState, FadeIn, Notice, Row, Screen, SectionHeader, Text, Toggle } from '../../ui/components';
import { radius, space, useTheme } from '../../ui/theme';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function greeting(h: number) {
  if (h < 5) return 'Dobrou noc';
  if (h < 10) return 'Dobré ráno';
  if (h < 12) return 'Dobré dopoledne';
  if (h < 18) return 'Dobré odpoledne';
  return 'Dobrý večer';
}

const dateFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Home() {
  const t = useTheme();
  const { alarms, tracks, lastSync, setAlarmEnabled, skipNext, deleteAlarm } = useApp();
  const now = useNow();
  const [permissionIssue, setPermissionIssue] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void getPermissionStatus().then((p) => {
        if (!alive || !p) return;
        const issues: string[] = [];
        if (p.exactAlarms === 'denied') issues.push('přesné budíky');
        if (p.notifications === 'denied') issues.push('oznámení');
        if (p.fullScreenIntent === 'denied') issues.push('zobrazení přes zamčenou obrazovku');
        if (p.alarmKit === 'denied') issues.push('systémové budíky (AlarmKit)');
        setPermissionIssue(issues.length ? issues.join(', ') : null);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const next = useMemo(() => soonest(alarms, now), [alarms, now]);
  const trackName = (a: Alarm) => tracks.find((x) => x.id === a.trackId)?.title ?? 'Výchozí tón';

  const openActions = (a: Alarm) => {
    const occ = nextOccurrence(a, new Date());
    const skipLabel = a.skipUntil ? 'Zrušit vynechání' : 'Vynechat příští zvonění';
    const run = (i: number) => {
      if (i === 0) router.push(`/alarm/${a.id}`);
      if (i === 1) void skipNext(a.id, a.skipUntil ? null : occ ? occ.getTime() + 60000 : null);
      if (i === 2)
        Alert.alert('Smazat budík?', a.label || formatTime(a.hour, a.minute), [
          { text: 'Zrušit', style: 'cancel' },
          { text: 'Smazat', style: 'destructive', onPress: () => void deleteAlarm(a.id) },
        ]);
    };
    const options = ['Upravit', skipLabel, 'Smazat'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, 'Zavřít'], destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        run,
      );
    } else {
      Alert.alert(a.label || formatTime(a.hour, a.minute), undefined, [
        ...options.map((o, i) => ({ text: o, onPress: () => run(i), style: i === 2 ? ('destructive' as const) : undefined })),
        { text: 'Zavřít', style: 'cancel' },
      ]);
    }
  };

  return (
    <Screen>
      <FadeIn>
        <Text variant="overline" muted>
          {dateFmt.format(now)}
        </Text>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text variant="display" style={{ fontVariant: ['tabular-nums'] }} accessibilityRole="header">
              {formatTime(now.getHours(), now.getMinutes())}
            </Text>
            <Text variant="heading" muted style={{ marginTop: -6 }}>
              {greeting(now.getHours())}
            </Text>
          </View>
        </Row>
      </FadeIn>

      <FadeIn delay={60}>
        <LinearGradient
          colors={[t.heroFrom, t.heroTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius.xl, padding: space.xl, gap: space.sm }}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="overline" color="rgba(255,255,255,0.75)">
              Nejbližší probuzení
            </Text>
            <Ionicons name="moon-outline" size={18} color="rgba(255,255,255,0.75)" />
          </Row>
          {next ? (
            <>
              <Text variant="hero" color="#FFFFFF" style={{ fontVariant: ['tabular-nums'] }}>
                {formatTime(next.at.getHours(), next.at.getMinutes())}
              </Text>
              <Text variant="bodyStrong" color="#FFFFFF">
                {relativeDayLabel(next.at, now)} · {formatCountdown(next.at, now)}
              </Text>
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: space.sm }} />
              <Row gap={space.sm}>
                <Ionicons name="musical-note" size={16} color="rgba(255,255,255,0.8)" />
                <Text variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ flex: 1 }}>
                  {trackName(next.item)}
                </Text>
              </Row>
              <Row gap={space.sm}>
                <Ionicons name="flash-outline" size={16} color="rgba(255,255,255,0.8)" />
                <Text variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ flex: 1 }}>
                  {planSummary(next.item.plan)}
                </Text>
              </Row>
            </>
          ) : (
            <Text variant="heading" color="#FFFFFF">
              Žádný aktivní budík
            </Text>
          )}
        </LinearGradient>
      </FadeIn>

      {!engineAvailable && (
        <Notice
          tone="danger"
          icon="warning-outline"
          title="Budíky teď nezazvoní"
          text="Tohle sestavení neobsahuje nativní budíkový engine (např. Expo Go). Nainstaluj vývojové nebo produkční sestavení Wakeify."
        />
      )}
      {engineAvailable && lastSync && !lastSync.ok && (
        <Notice tone="danger" icon="warning-outline" title="Plánování selhalo" text={lastSync.message} />
      )}
      {permissionIssue && (
        <Notice
          tone="warm"
          icon="shield-checkmark-outline"
          title="Chybí oprávnění"
          text={`Pro spolehlivé buzení povol: ${permissionIssue}.`}
          action={<Button title="Zkontrolovat" size="md" kind="secondary" onPress={() => router.push('/permissions')} />}
        />
      )}

      <Button title="Nový budík" icon="add" onPress={() => router.push('/alarm/new')} />

      {alarms.length > 0 && <SectionHeader title="Budíky" />}
      {alarms.length === 0 ? (
        <EmptyState
          icon="alarm-outline"
          title="Zatím žádný budík"
          text="Nastav si první budík s vlastní písničkou a ranním úkolem, který tě opravdu probudí."
        />
      ) : (
        alarms.map((a, i) => {
          const occ = nextOccurrence(a, now);
          return (
            <FadeIn key={a.id} delay={80 + i * 30}>
              <Card
                onPress={() => router.push(`/alarm/${a.id}`)}
                accessibilityLabel={`Budík ${formatTime(a.hour, a.minute)}, ${a.label}, ${describeRepeat(a.weekdays)}, ${a.enabled ? 'zapnutý' : 'vypnutý'}`}
              >
                <Row align="flex-start">
                  <View style={{ flex: 1, gap: 4, opacity: a.enabled ? 1 : 0.5 }}>
                    <Text style={{ fontSize: 40, fontWeight: '300', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>
                      {formatTime(a.hour, a.minute)}
                    </Text>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {a.label || 'Budík'}
                      <Text muted> · {describeRepeat(a.weekdays)}</Text>
                    </Text>
                    <Row gap={6} style={{ flexWrap: 'wrap', marginTop: 6 }}>
                      <Chip icon="musical-note" label={trackName(a)} />
                      <Chip icon="flash-outline" label={planSummary(a.plan)} />
                      {a.skipUntil && a.enabled ? <Chip icon="play-skip-forward-outline" label="Příští vynechán" /> : null}
                    </Row>
                    {a.enabled && occ ? (
                      <Text variant="caption" faint style={{ marginTop: 4 }}>
                        Zazvoní {relativeDayLabel(occ, now)} {formatCountdown(occ, now)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: space.md }}>
                    <Toggle
                      value={a.enabled}
                      onChange={(v) => void setAlarmEnabled(a.id, v)}
                      label={`Budík ${formatTime(a.hour, a.minute)} ${a.enabled ? 'zapnutý' : 'vypnutý'}`}
                    />
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={22}
                      color={t.textMuted}
                      onPress={() => openActions(a)}
                      accessibilityRole="button"
                      accessibilityLabel="Další akce"
                      style={{ padding: 6 }}
                    />
                  </View>
                </Row>
              </Card>
            </FadeIn>
          );
        })
      )}
    </Screen>
  );
}
