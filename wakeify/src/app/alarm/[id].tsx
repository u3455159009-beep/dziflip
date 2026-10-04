import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';

import { ChallengePlanEditor, planProblems } from '../../components/ChallengeEditor';
import { TrackPicker } from '../../components/TrackPicker';
import { defaultPlan } from '../../domain/rotation';
import { ALL_WEEKDAYS, WEEKEND, WORKDAYS, formatCountdown, nextOccurrence, relativeDayLabel } from '../../domain/schedule';
import type { Alarm, IsoWeekday } from '../../domain/types';
import { engineAvailable, scheduleTestRing } from '../../services/alarmEngine';
import { newId } from '../../services/ids';
import { formatDuration } from '../../services/music';
import { useApp } from '../../state/AppProvider';
import { Button, Card, Chip, Divider, IconButton, ListRow, Row, Screen, SectionHeader, Stepper, Text, Toggle } from '../../ui/components';
import { Slider, TimeWheel, WeekdayPicker } from '../../ui/controls';
import { radius, space, useTheme } from '../../ui/theme';

const FADES = [0, 15, 30, 60, 120];

function sameDays(a: IsoWeekday[], b: IsoWeekday[]) {
  return a.length === b.length && b.every((d) => a.includes(d));
}

export default function AlarmEditor() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const isNew = id === 'new';
  const existing = app.alarms.find((a) => a.id === id);

  const initial = useMemo<Alarm>(() => {
    if (existing) return existing;
    const now = Date.now();
    return {
      id: newId(),
      label: '',
      hour: 7,
      minute: 0,
      weekdays: [...WORKDAYS],
      enabled: true,
      skipUntil: null,
      trackId: app.tracks[0]?.id ?? null,
      volume: 0.8,
      fadeInSeconds: 30,
      vibrate: true,
      snoozeMinutes: app.settings.defaultSnoozeMinutes,
      maxSnoozes: app.settings.defaultMaxSnoozes,
      plan: defaultPlan(),
      message: null,
      createdAt: now,
      updatedAt: now,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!existing]);

  const [a, setA] = useState<Alarm>(initial);
  const [pickTrack, setPickTrack] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => setA(initial), [initial]);
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(iv);
  }, []);

  const set = <K extends keyof Alarm>(k: K, v: Alarm[K]) => setA((x) => ({ ...x, [k]: v }));
  const track = app.tracks.find((x) => x.id === a.trackId);
  const occ = nextOccurrence({ ...a, enabled: true, skipUntil: null }, now);
  const problems = planProblems(
    a.plan,
    new Set(app.qrTargets.map((q) => q.id)),
    new Set(app.photoTargets.map((p) => p.id)),
  );

  if (!isNew && !existing && app.ready) {
    return (
      <Screen>
        <Text variant="title">Budík nenalezen</Text>
        <Button title="Zpět" onPress={() => router.back()} />
      </Screen>
    );
  }

  const save = async () => {
    if (problems.length) {
      Alert.alert('Ještě chvilku', problems.join('\n'));
      return;
    }
    setSaving(true);
    try {
      await app.saveAlarm({ ...a, enabled: true, skipUntil: isNew ? null : a.skipUntil });
      router.back();
    } catch (e) {
      Alert.alert('Uložení selhalo', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Smazat budík?', undefined, [
      { text: 'Zrušit', style: 'cancel' },
      {
        text: 'Smazat',
        style: 'destructive',
        onPress: async () => {
          await app.deleteAlarm(a.id);
          router.back();
        },
      },
    ]);

  const test = async () => {
    if (problems.length) {
      Alert.alert('Ještě chvilku', problems.join('\n'));
      return;
    }
    await app.saveAlarm({ ...a, enabled: existing?.enabled ?? true });
    const ok = await scheduleTestRing(a.id, 10).catch(() => false);
    Alert.alert(
      ok ? 'Zkušební budík za 10 s' : 'Nelze otestovat',
      ok
        ? 'Zamkni telefon a počkej. Budík zazvoní přes stejnou systémovou cestu jako ráno.'
        : 'Nativní budíkový engine není v tomto sestavení dostupný.',
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen topInset={Platform.OS !== 'ios'}>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="close" label="Zavřít bez uložení" onPress={() => router.back()} />
          <Text variant="heading">{isNew ? 'Nový budík' : 'Upravit budík'}</Text>
          <View style={{ width: 44 }} />
        </Row>

        <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
          <TimeWheel hour={a.hour} minute={a.minute} onChange={(hour, minute) => setA((x) => ({ ...x, hour, minute }))} />
          {occ && (
            <Text muted style={{ marginTop: space.md }}>
              Zazvoní {relativeDayLabel(occ, now)} {formatCountdown(occ, now)}
            </Text>
          )}
        </Card>

        <SectionHeader title="Opakování" />
        <Card style={{ gap: space.md }}>
          <WeekdayPicker value={a.weekdays} onChange={(w) => set('weekdays', w)} />
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            <Chip label="Jednou" selected={a.weekdays.length === 0} onPress={() => set('weekdays', [])} />
            <Chip label="Pracovní dny" selected={sameDays(a.weekdays, WORKDAYS)} onPress={() => set('weekdays', [...WORKDAYS])} />
            <Chip label="Víkend" selected={sameDays(a.weekdays, WEEKEND)} onPress={() => set('weekdays', [...WEEKEND])} />
            <Chip label="Každý den" selected={sameDays(a.weekdays, ALL_WEEKDAYS)} onPress={() => set('weekdays', [...ALL_WEEKDAYS])} />
          </Row>
        </Card>

        <SectionHeader title="Název" />
        <TextInput
          value={a.label}
          onChangeText={(v) => set('label', v)}
          placeholder="Např. Práce, Běh, Víkend"
          placeholderTextColor={t.textFaint}
          maxLength={40}
          accessibilityLabel="Název budíku"
          style={{
            backgroundColor: t.surface,
            color: t.text,
            borderRadius: radius.lg,
            paddingHorizontal: space.lg,
            minHeight: 54,
            fontSize: 16,
            borderWidth: 1,
            borderColor: t.border,
          }}
        />

        <SectionHeader title="Zvuk" />
        <Card style={{ gap: space.md }}>
          <ListRow
            icon="musical-notes"
            title={track ? track.title : 'Výchozí tón'}
            subtitle={
              track
                ? `${track.artist ? `${track.artist} · ` : ''}začátek ${formatDuration(track.startOffsetMs)} · uloženo offline`
                : 'Vyber vlastní písničku z knihovny'
            }
            onPress={() => setPickTrack(true)}
          />
          {track && (
            <Button
              title="Nastavit začátek skladby"
              kind="ghost"
              size="md"
              icon="cut-outline"
              onPress={() => router.push(`/track/${track.id}`)}
            />
          )}
          <Divider />
          <Text muted>Hlasitost {Math.round(a.volume * 100)} %</Text>
          <Slider value={a.volume} onChange={(v) => set('volume', v)} min={0.1} max={1} step={0.05} label="Hlasitost" format={(v) => `${Math.round(v * 100)} %`} />
          <Text muted>Postupné zesilování</Text>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {FADES.map((f) => (
              <Chip
                key={f}
                label={f === 0 ? 'Vypnuto' : f < 60 ? `${f} s` : `${f / 60} min`}
                selected={a.fadeInSeconds === f}
                onPress={() => set('fadeInSeconds', f)}
              />
            ))}
          </Row>
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text>Vibrace</Text>
            <Toggle value={a.vibrate} onChange={(v) => set('vibrate', v)} label="Vibrace" />
          </Row>
        </Card>

        <SectionHeader title="Úkol pro vypnutí" />
        <ChallengePlanEditor value={a.plan} onChange={(plan) => set('plan', plan)} />

        <SectionHeader title="Odložení" />
        <Card style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text>Interval</Text>
            <Stepper label="Interval odložení" value={a.snoozeMinutes} min={1} max={30} onChange={(v) => set('snoozeMinutes', v)} format={(v) => `${v} min`} />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text>Max. odložení</Text>
            <Stepper
              label="Maximální počet odložení"
              value={a.maxSnoozes}
              min={0}
              max={5}
              onChange={(v) => set('maxSnoozes', v)}
              format={(v) => (v === 0 ? 'Nikdy' : `${v}×`)}
            />
          </Row>
        </Card>

        <SectionHeader title="Ranní zpráva" />
        <TextInput
          value={a.message ?? ''}
          onChangeText={(v) => set('message', v.trim() ? v : null)}
          placeholder={app.settings.affirmation}
          placeholderTextColor={t.textFaint}
          multiline
          maxLength={200}
          accessibilityLabel="Ranní zpráva pro tento budík"
          style={{
            backgroundColor: t.surface,
            color: t.text,
            borderRadius: radius.lg,
            padding: space.lg,
            minHeight: 80,
            fontSize: 16,
            borderWidth: 1,
            borderColor: t.border,
            textAlignVertical: 'top',
          }}
        />

        {problems.length > 0 && (
          <Text variant="caption" color={t.warm}>
            {problems.join(' ')}
          </Text>
        )}
        <Button title="Uložit budík" icon="checkmark" loading={saving} onPress={save} />
        {engineAvailable && <Button title="Vyzkoušet (zazvoní za 10 s)" kind="secondary" icon="play-circle-outline" onPress={test} />}
        {!isNew && <Button title="Smazat budík" kind="danger" icon="trash-outline" onPress={remove} />}
      </Screen>
      <TrackPicker
        visible={pickTrack}
        selectedId={a.trackId}
        onSelect={(tid) => {
          set('trackId', tid);
          setPickTrack(false);
        }}
        onClose={() => setPickTrack(false)}
      />
    </KeyboardAvoidingView>
  );
}
