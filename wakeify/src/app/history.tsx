import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';

import * as repo from '../data/repositories';
import { kindLabel } from '../domain/rotation';
import { formatTime } from '../domain/schedule';
import type { WakeEvent } from '../domain/types';
import { getDb } from '../services/database';
import { useApp } from '../state/AppProvider';
import { Button, Card, Divider, EmptyState, IconButton, ListRow, Row, Screen, Text } from '../ui/components';

const dayFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });

export default function History() {
  const { settings, historyChanged } = useApp();
  const [events, setEvents] = useState<WakeEvent[]>([]);
  const load = useCallback(async () => setEvents(await repo.listWakeEvents(await getDb())), []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const clear = () =>
    Alert.alert('Smazat historii?', 'Statistiky a série se vynulují.', [
      { text: 'Zrušit', style: 'cancel' },
      {
        text: 'Smazat',
        style: 'destructive',
        onPress: async () => {
          await repo.clearWakeEvents(await getDb());
          historyChanged();
          await load();
        },
      },
    ]);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton icon="chevron-back" label="Zpět" onPress={() => router.back()} />
        <Text variant="heading">Historie</Text>
        <View style={{ width: 44 }} />
      </Row>
      {events.length === 0 ? (
        <EmptyState icon="time-outline" title="Prázdná historie" text="Každé probuzení se tu zapíše — i to zmeškané." />
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {events.map((e, i) => {
            const sched = new Date(e.scheduledFor);
            const late = e.dismissedAt != null ? Math.round((e.dismissedAt - e.scheduledFor) / 60000) : null;
            const onTime = late != null && late <= settings.onTimeGraceMinutes;
            return (
              <View key={e.id}>
                {i > 0 && <Divider />}
                <ListRow
                  icon={e.outcome === 'missed' ? 'close-circle-outline' : onTime ? 'checkmark-circle-outline' : 'hourglass-outline'}
                  iconTone={e.outcome === 'missed' ? 'danger' : onTime ? 'accent' : 'warm'}
                  title={`${dayFmt.format(sched)} · ${formatTime(sched.getHours(), sched.getMinutes())} · ${e.alarmLabel}`}
                  subtitle={
                    e.outcome === 'missed'
                      ? 'Zmeškáno'
                      : [
                          `vzhůru za ${late} min`,
                          e.snoozeCount ? `${e.snoozeCount}× odloženo` : null,
                          e.challengeKinds.map(kindLabel).join(' + ') || null,
                          e.outcome === 'fallback' ? 'alternativní ověření' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                  }
                />
              </View>
            );
          })}
        </Card>
      )}
      {events.length > 0 && <Button title="Smazat historii" kind="danger" size="md" onPress={clear} />}
    </Screen>
  );
}
