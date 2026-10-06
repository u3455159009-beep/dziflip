import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import * as repo from '../../data/repositories';
import { computeStats, type DayStatus, type WakeStats } from '../../domain/stats';
import { formatTime, isoWeekday, weekdayShort } from '../../domain/schedule';
import { getDb } from '../../services/database';
import { useApp } from '../../state/AppProvider';
import { Button, Card, EmptyState, FadeIn, Row, Screen, SectionHeader, Text } from '../../ui/components';
import { radius, space, useTheme } from '../../ui/theme';

function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'primary' | 'accent' | 'warm' | 'sky' }) {
  return (
    <Card tone={tone} style={{ flex: 1, gap: 4 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text style={{ fontSize: 30, fontWeight: '600', letterSpacing: -0.5 }}>{value}</Text>
      {sub ? (
        <Text variant="caption" muted>
          {sub}
        </Text>
      ) : null}
    </Card>
  );
}

export default function Stats() {
  const t = useTheme();
  const { settings, historyVersion } = useApp();
  const [stats, setStats] = useState<WakeStats | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const events = await repo.listWakeEvents(await getDb(), Date.now() - 365 * 86400000);
        if (alive) setStats(computeStats(events, settings.onTimeGraceMinutes, new Date()));
      })();
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings.onTimeGraceMinutes, historyVersion]),
  );

  const statusColor = (s: DayStatus) =>
    s === 'onTime' ? t.accent : s === 'late' ? t.warm : s === 'missed' ? t.danger : t.surfaceAlt;
  const statusLabel = (s: DayStatus) => (s === 'onTime' ? 'včas' : s === 'late' ? 'později' : s === 'missed' ? 'zmeškáno' : 'bez budíku');

  return (
    <Screen>
      <FadeIn>
        <Text variant="title" accessibilityRole="header">
          Ranní návyky
        </Text>
      </FadeIn>
      {!stats || stats.totalRings === 0 ? (
        <EmptyState icon="sunny-outline" title="Zatím žádná rána" text="Jakmile tě Wakeify poprvé vzbudí, uvidíš tady svou sérii a nejčastější časy vstávání." />
      ) : (
        <>
          <FadeIn delay={60}>
            <Card tone="primary" style={{ gap: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View>
                  <Text variant="caption" muted>
                    Aktuální série
                  </Text>
                  <Row gap={6}>
                    <Ionicons name="flame" size={30} color={t.warm} />
                    <Text style={{ fontSize: 44, fontWeight: '600', letterSpacing: -1 }}>{stats.currentStreak}</Text>
                    <Text muted style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
                      {stats.currentStreak === 1 ? 'ráno' : 'rán'} včas
                    </Text>
                  </Row>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="caption" muted>
                    Rekord
                  </Text>
                  <Text variant="heading">{stats.bestStreak}</Text>
                </View>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                {stats.last7Days.map((d) => (
                  <View key={d.dayIndex} style={{ alignItems: 'center', gap: 6 }} accessible accessibilityLabel={`${weekdayShort(isoWeekday(d.date))}: ${statusLabel(d.status)}`}>
                    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: statusColor(d.status), alignItems: 'center', justifyContent: 'center' }}>
                      {d.status === 'onTime' && <Ionicons name="checkmark" size={16} color="#0B1020" />}
                      {d.status === 'missed' && <Ionicons name="close" size={16} color="#0B1020" />}
                    </View>
                    <Text variant="caption" muted>
                      {weekdayShort(isoWeekday(d.date))}
                    </Text>
                  </View>
                ))}
              </Row>
            </Card>
          </FadeIn>
          <Row gap={space.md}>
            <StatTile tone="accent" label="Úspěšnost" value={`${Math.round(stats.successRate * 100)} %`} sub={`${stats.successes} z ${stats.totalRings}`} />
            <StatTile tone="sky" label="Dní včas" value={String(stats.onTimeDays)} sub={`tolerance ${settings.onTimeGraceMinutes} min`} />
          </Row>
          <Row gap={space.md}>
            <StatTile
              tone="warm"
              label="Průměrně vzhůru"
              value={stats.averageWakeMinutes != null ? formatTime(Math.floor(stats.averageWakeMinutes / 60), stats.averageWakeMinutes % 60) : '–'}
            />
            <StatTile
              tone="primary"
              label="Úkol trvá"
              value={stats.averageChallengeSeconds != null ? `${Math.round(stats.averageChallengeSeconds)} s` : '–'}
              sub={`odložení ⌀ ${stats.averageSnoozes.toFixed(1)}`}
            />
          </Row>
          {stats.topWakeTimes.length > 0 && (
            <>
              <SectionHeader title="Nejčastější časy vstávání" />
              <Card style={{ gap: space.md }}>
                {stats.topWakeTimes.map((w) => {
                  const max = stats.topWakeTimes[0].count;
                  return (
                    <Row key={w.label}>
                      <Text variant="bodyStrong" style={{ width: 56, fontVariant: ['tabular-nums'] }}>
                        {w.label}
                      </Text>
                      <View style={{ flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: t.surfaceAlt }}>
                        <View style={{ width: `${(w.count / max) * 100}%`, height: 10, borderRadius: radius.pill, backgroundColor: t.primary }} />
                      </View>
                      <Text variant="caption" muted style={{ width: 32, textAlign: 'right' }}>
                        {w.count}×
                      </Text>
                    </Row>
                  );
                })}
              </Card>
            </>
          )}
          <Button title="Historie probuzení" kind="secondary" icon="list-outline" onPress={() => router.push('/history')} />
        </>
      )}
    </Screen>
  );
}
