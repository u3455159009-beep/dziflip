import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, TextInput, View } from 'react-native';

import { referencedTargets } from '../../domain/rotation';
import type { Settings, ThemePreference } from '../../domain/types';
import { deleteStoredPhotos } from '../../services/photo';
import { useApp } from '../../state/AppProvider';
import { Card, Divider, IconButton, ListRow, Row, Screen, SectionHeader, Segmented, Stepper, Text } from '../../ui/components';
import { radius, space, useTheme } from '../../ui/theme';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Systém' },
  { value: 'light', label: 'Světlý' },
  { value: 'dark', label: 'Tmavý' },
];

export default function SettingsScreen() {
  const t = useTheme();
  const app = useApp();
  const [s, setS] = useState<Settings>(app.settings);
  useEffect(() => setS(app.settings), [app.settings]);

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    void app.saveSettings(next);
  };

  const usedBy = (kind: 'qr' | 'photo', id: string) =>
    app.alarms.filter((a) => referencedTargets(a.plan)[kind].has(id)).map((a) => a.label || 'Budík');

  const removeTarget = (kind: 'qr' | 'photo', id: string, name: string) => {
    const used = usedBy(kind, id);
    Alert.alert(
      `Smazat „${name}“?`,
      used.length ? `Používá ho: ${used.join(', ')}. Tyto budíky pak nabídnou alternativní ověření.` : undefined,
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Smazat',
          style: 'destructive',
          onPress: async () => {
            if (kind === 'qr') await app.deleteQrTarget(id);
            else {
              const p = app.photoTargets.find((x) => x.id === id);
              await app.deletePhotoTarget(id);
              if (p) deleteStoredPhotos(p.imageUris);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Nastavení
      </Text>

      <Card style={{ paddingVertical: space.sm }}>
        <ListRow icon="shield-checkmark-outline" iconTone="accent" title="Spolehlivost budíku" subtitle="Oprávnění, úspora baterie, zkušební budík" onPress={() => router.push('/permissions')} />
        <Divider />
        <ListRow icon="play-circle-outline" iconTone="sky" title="Ukázka zvonění" subtitle="Vyzkoušej ranní obrazovku a úkoly nanečisto" onPress={() => {
          const a = app.alarms[0];
          if (!a) Alert.alert('Nejdřív si vytvoř budík');
          else router.push(`/ring?demo=1&alarmId=${a.id}`);
        }} />
        <Divider />
        <ListRow icon="time-outline" iconTone="warm" title="Historie probuzení" onPress={() => router.push('/history')} />
      </Card>

      <SectionHeader title="Vzhled" />
      <Segmented options={THEMES} value={s.theme} onChange={(theme) => update({ theme })} />

      <SectionHeader title="Ranní afirmace" />
      <TextInput
        value={s.affirmation}
        onChangeText={(affirmation) => setS({ ...s, affirmation })}
        onEndEditing={() => update({ affirmation: s.affirmation.trim() || app.settings.affirmation })}
        multiline
        maxLength={200}
        accessibilityLabel="Ranní afirmace"
        style={{ backgroundColor: t.surface, color: t.text, borderRadius: radius.lg, padding: space.lg, minHeight: 80, fontSize: 16, borderWidth: 1, borderColor: t.border, textAlignVertical: 'top' }}
      />

      <SectionHeader title="Buzení" />
      <Card style={{ gap: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text>Tolerance „včas“</Text>
            <Text variant="caption" muted>Pro statistiky a sérii</Text>
          </View>
          <Stepper label="Tolerance" value={s.onTimeGraceMinutes} min={0} max={60} step={5} onChange={(v) => update({ onTimeGraceMinutes: v })} format={(v) => `${v} min`} />
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text>Max. délka zvonění</Text>
            <Text variant="caption" muted>Pak se zapíše jako zmeškané</Text>
          </View>
          <Stepper label="Maximální délka zvonění" value={s.maxRingMinutes} min={5} max={60} step={5} onChange={(v) => update({ maxRingMinutes: v })} format={(v) => `${v} min`} />
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text>Opakované buzení</Text>
            <Text variant="caption" muted>Když budík vypneš mimo aplikaci (iOS), zazvoní znovu</Text>
          </View>
          <Stepper label="Interval opakovaného buzení" value={s.backupRepeatMinutes} min={1} max={10} onChange={(v) => update({ backupRepeatMinutes: v })} format={(v) => `${v} min`} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ flex: 1 }}>Počet opakování</Text>
          <Stepper label="Počet opakování" value={s.backupCount} min={0} max={10} onChange={(v) => update({ backupCount: v })} format={(v) => `${v}×`} />
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ flex: 1 }}>Výchozí odložení</Text>
          <Stepper label="Výchozí interval odložení" value={s.defaultSnoozeMinutes} min={1} max={30} onChange={(v) => update({ defaultSnoozeMinutes: v })} format={(v) => `${v} min`} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ flex: 1 }}>Výchozí max. odložení</Text>
          <Stepper label="Výchozí maximální počet odložení" value={s.defaultMaxSnoozes} min={0} max={5} onChange={(v) => update({ defaultMaxSnoozes: v })} format={(v) => (v ? `${v}×` : 'Nikdy')} />
        </Row>
      </Card>

      <SectionHeader title="Předměty k vyfocení" action={<IconButton icon="add" size={32} label="Nový předmět" onPress={() => router.push('/targets/photo')} />} />
      <Card style={{ paddingVertical: space.sm }}>
        {app.photoTargets.length === 0 && <Text variant="caption" muted style={{ paddingVertical: space.sm }}>Např. umyvadlo, kávovar, výhled z okna.</Text>}
        {app.photoTargets.map((p, i) => (
          <View key={p.id}>
            {i > 0 && <Divider />}
            <Row style={{ minHeight: 60 }}>
              <Image source={{ uri: p.imageUris[0] }} style={{ width: 44, height: 44, borderRadius: 12 }} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{p.name}</Text>
                <Text variant="caption" muted>{p.imageUris.length} {p.imageUris.length === 1 ? 'předloha' : 'předlohy'}</Text>
              </View>
              <IconButton icon="trash-outline" tone="plain" size={36} label={`Smazat ${p.name}`} onPress={() => removeTarget('photo', p.id, p.name)} />
            </Row>
          </View>
        ))}
      </Card>

      <SectionHeader title="QR kódy" action={<IconButton icon="add" size={32} label="Nový QR kód" onPress={() => router.push('/targets/qr')} />} />
      <Card style={{ paddingVertical: space.sm }}>
        {app.qrTargets.length === 0 && <Text variant="caption" muted style={{ paddingVertical: space.sm }}>Vytiskni kód a nalep ho tam, kam ráno musíš dojít.</Text>}
        {app.qrTargets.map((q, i) => (
          <View key={q.id}>
            {i > 0 && <Divider />}
            <ListRow
              icon="qr-code-outline"
              title={q.name}
              subtitle={q.generated ? 'Vygenerováno ve Wakeify' : 'Vlastní kód'}
              onPress={() => router.push(`/targets/qr?id=${q.id}`)}
              right={<IconButton icon="trash-outline" tone="plain" size={36} label={`Smazat ${q.name}`} onPress={() => removeTarget('qr', q.id, q.name)} />}
            />
          </View>
        ))}
      </Card>

      <SectionHeader title="O aplikaci" />
      <Card tone="alt" style={{ gap: space.sm }}>
        <Text variant="bodyStrong">Wakeify 1.0</Text>
        <Text variant="caption" muted>
          Vše zůstává v telefonu: budíky, hudba, fotky předmětů i historie. Žádný účet, žádný internet. Rozpoznávání fotek běží lokálně.
        </Text>
      </Card>
    </Screen>
  );
}
