import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Pedometer } from 'expo-sensors';
import { useCallback, useState } from 'react';
import { Alert, AppState, Linking, Platform, View } from 'react-native';

import type { AlarmPermissionStatus, PermissionKind, PermissionState } from '../../modules/wakeify-alarm';
import { engineAvailable, getPermissionStatus, requestPermission, scheduleTestRing } from '../services/alarmEngine';
import { useApp } from '../state/AppProvider';
import { Button, Card, Divider, IconButton, Notice, Row, Screen, SectionHeader, Text } from '../ui/components';
import { space, useTheme } from '../ui/theme';

type Item = { kind: PermissionKind; title: string; why: string; state: PermissionState; required: boolean };

function itemsFor(p: AlarmPermissionStatus): Item[] {
  const all: Item[] = [
    { kind: 'alarmKit', title: 'Systémové budíky (AlarmKit)', why: 'Budík zazvoní i v tichém režimu, při Soustředění a zamčeném telefonu.', state: p.alarmKit, required: true },
    { kind: 'exactAlarms', title: 'Přesné budíky', why: 'Bez tohoto povolení může Android budík zpozdit o několik minut.', state: p.exactAlarms, required: true },
    { kind: 'notifications', title: 'Oznámení', why: p.platform === 'android' ? 'Zvonící budík se zobrazuje jako oznámení.' : 'Záložní buzení na starších iOS.', state: p.notifications, required: p.platform === 'android' || p.engine === 'ios-notifications' },
    { kind: 'fullScreenIntent', title: 'Zobrazení přes zamčenou obrazovku', why: 'Ranní obrazovka se ukáže hned, bez odemykání.', state: p.fullScreenIntent, required: true },
    { kind: 'batteryOptimization', title: 'Bez omezení baterie', why: 'Úsporné režimy výrobců (Xiaomi, Huawei, Samsung…) jinak umí aplikaci uspat.', state: p.batteryOptimizationIgnored, required: false },
  ];
  return all.filter((i) => i.state !== 'unsupported');
}

const STATE_TEXT: Record<PermissionState, string> = {
  granted: 'Povoleno',
  denied: 'Zakázáno',
  notDetermined: 'Nenastaveno',
  unsupported: '—',
};

export default function Permissions() {
  const t = useTheme();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const app = useApp();
  const [status, setStatus] = useState<AlarmPermissionStatus | null>(null);
  const [camera, requestCamera] = useCameraPermissions();
  const [motion, setMotion] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    setStatus(await getPermissionStatus());
    try {
      setMotion((await Pedometer.getPermissionsAsync()).granted);
    } catch {
      setMotion(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      // Returning from a system settings screen → re-check.
      const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
      return () => sub.remove();
    }, [refresh]),
  );

  const ask = async (kind: PermissionKind) => {
    try {
      await requestPermission(kind);
    } finally {
      await refresh();
    }
  };

  const finish = async () => {
    if (!app.settings.onboardingDone) await app.saveSettings({ ...app.settings, onboardingDone: true });
    router.back();
  };

  const test = async () => {
    const id = app.alarms[0]?.id;
    if (!id) {
      Alert.alert('Nejdřív si vytvoř budík', 'Zkušební zvonění použije jeho hudbu a úkol.');
      return;
    }
    const ok = await scheduleTestRing(id, 10).catch(() => false);
    Alert.alert(ok ? 'Zamkni telefon' : 'Nelze otestovat', ok ? 'Za 10 sekund zazvoní „' + (app.alarms[0].label || 'Budík') + '“.' : 'Nativní engine chybí.');
  };

  const items = status ? itemsFor(status) : [];
  const allGood = items.filter((i) => i.required).every((i) => i.state === 'granted');

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ width: 44 }} />
        <Text variant="heading">{onboarding ? 'Vítej ve Wakeify' : 'Spolehlivost'}</Text>
        <IconButton icon="close" label="Zavřít" onPress={finish} />
      </Row>
      {onboarding && (
        <Text muted>
          Wakeify tě budí tvojí hudbou uloženou v telefonu — bez internetu. Aby budík zazvonil vždy, i při zamčeném telefonu a v úsporném režimu,
          potřebuje pár oprávnění.
        </Text>
      )}

      {!engineAvailable && (
        <Notice
          tone="danger"
          icon="warning-outline"
          title="Nativní engine chybí"
          text="Toto sestavení (např. Expo Go) neumí plánovat systémové budíky. Nainstaluj vývojové/produkční sestavení — viz README."
        />
      )}

      {status && (
        <>
          <Card tone={allGood ? 'accent' : 'warm'}>
            <Row>
              <Ionicons name={allGood ? 'shield-checkmark' : 'shield-outline'} size={28} color={allGood ? t.accent : t.warm} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{allGood ? 'Budík je připraven' : 'Něco ještě chybí'}</Text>
                <Text variant="caption" muted>
                  Engine:{' '}
                  {status.engine === 'android-alarmmanager'
                    ? 'Android AlarmManager + služba v popředí'
                    : status.engine === 'ios-alarmkit'
                      ? 'iOS AlarmKit'
                      : 'iOS oznámení (záložní režim)'}
                </Text>
              </View>
            </Row>
          </Card>
          <Card style={{ gap: space.sm }}>
            {items.map((i, idx) => (
              <View key={i.kind} style={{ gap: space.sm }}>
                {idx > 0 && <Divider />}
                <Row align="flex-start">
                  <Ionicons
                    name={i.state === 'granted' ? 'checkmark-circle' : i.state === 'denied' ? 'close-circle' : 'ellipse-outline'}
                    size={22}
                    color={i.state === 'granted' ? t.accent : i.state === 'denied' ? t.danger : t.textFaint}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{i.title}</Text>
                    <Text variant="caption" muted>
                      {i.why}
                    </Text>
                    <Text variant="caption" faint>
                      {STATE_TEXT[i.state]}
                      {i.required ? '' : ' · doporučeno'}
                    </Text>
                  </View>
                  {i.state !== 'granted' && <Button title="Povolit" size="md" onPress={() => void ask(i.kind)} />}
                </Row>
              </View>
            ))}
          </Card>
        </>
      )}

      <SectionHeader title="Pro úkoly" />
      <Card style={{ gap: space.sm }}>
        <Row>
          <Ionicons name={camera?.granted ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={camera?.granted ? t.accent : t.textFaint} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Fotoaparát</Text>
            <Text variant="caption" muted>Focení předmětu a QR kódy.</Text>
          </View>
          {!camera?.granted && <Button title="Povolit" size="md" onPress={() => void requestCamera()} />}
        </Row>
        <Divider />
        <Row>
          <Ionicons name={motion ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={motion ? t.accent : t.textFaint} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Pohyb a kroky</Text>
            <Text variant="caption" muted>Úkol „Ujdi N kroků“. Bez něj použijeme akcelerometr.</Text>
          </View>
          {!motion && (
            <Button
              title="Povolit"
              size="md"
              onPress={async () => {
                await Pedometer.requestPermissionsAsync().catch(() => null);
                await refresh();
              }}
            />
          )}
        </Row>
      </Card>

      <SectionHeader title="Tipy" />
      <Card tone="alt" style={{ gap: space.sm }}>
        {Platform.OS === 'android' ? (
          <>
            <Text variant="caption" muted>• Nech Wakeify v seznamu nedávných aplikací; „Vynutit zastavení“ v nastavení zruší všechny budíky až do dalšího spuštění.</Text>
            <Text variant="caption" muted>• Xiaomi/Huawei/Oppo: povol „Automatické spuštění“ a vypni úsporu baterie pro Wakeify.</Text>
            <Text variant="caption" muted>• Po restartu telefonu se budíky obnoví samy. Před prvním odemčením zazní systémový tón místo tvé skladby.</Text>
          </>
        ) : (
          <>
            <Text variant="caption" muted>• Systémový budík přehraje 29s úryvek tvé skladby (limit iOS). Otevři Wakeify a hraje celá skladba.</Text>
            <Text variant="caption" muted>• Tlačítko „Zastavit“ na zamčené obrazovce iOS nejde odebrat — Wakeify proto zazvoní znovu, dokud nesplníš úkol.</Text>
          </>
        )}
        <Button title="Otevřít nastavení aplikace" kind="ghost" size="md" onPress={() => void Linking.openSettings()} />
      </Card>

      {engineAvailable && <Button title="Zkušební budík za 10 s" kind="secondary" icon="alarm-outline" onPress={test} />}
      <Button title={onboarding ? 'Pokračovat' : 'Hotovo'} onPress={finish} />
    </Screen>
  );
}
