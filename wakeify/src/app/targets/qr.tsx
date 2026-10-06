import { CameraView, useCameraPermissions } from 'expo-camera';
import { File, Paths } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { newQrPayload, qrSvgDocument, qrSvgPath } from '../../domain/qr';
import { newId } from '../../services/ids';
import { useApp } from '../../state/AppProvider';
import { Button, Card, IconButton, Row, Screen, Segmented, Text } from '../../ui/components';
import { radius, space, useTheme } from '../../ui/theme';

function QrView({ payload, size = 240 }: { payload: string; size?: number }) {
  const { size: n, d } = useMemo(() => qrSvgPath(payload), [payload]);
  return (
    <View style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: radius.lg, alignSelf: 'center' }} accessibilityLabel="QR kód">
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
        <Rect width={n} height={n} fill="#FFFFFF" />
        <Path d={d} fill="#000000" />
      </Svg>
    </View>
  );
}

async function share(payload: string, name: string) {
  const file = new File(Paths.cache, `wakeify-qr-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'kod'}.svg`);
  file.write(qrSvgDocument(payload, `Wakeify · ${name}`));
  if (await isAvailableAsync()) await shareAsync(file.uri, { mimeType: 'image/svg+xml', dialogTitle: 'Vytisknout QR kód' });
  else Alert.alert('Sdílení není dostupné', 'Udělej si snímek obrazovky a vytiskni ho.');
}

export default function QrTargetScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { qrTargets, saveQrTarget } = useApp();
  const existing = qrTargets.find((q) => q.id === id);
  const [mode, setMode] = useState<'generate' | 'scan'>('generate');
  const [name, setName] = useState('Koupelna');
  const [payload] = useState(() => newQrPayload());
  const [scanned, setScanned] = useState<string | null>(null);
  const [perm, request] = useCameraPermissions();
  const lock = useRef(false);

  if (existing) {
    return (
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="close" label="Zavřít" onPress={() => router.back()} />
          <Text variant="heading">{existing.name}</Text>
          <View style={{ width: 44 }} />
        </Row>
        {existing.generated ? (
          <>
            <QrView payload={existing.payload} />
            <Button title="Sdílet / vytisknout" icon="print-outline" onPress={() => void share(existing.payload, existing.name)} />
          </>
        ) : (
          <Card>
            <Text muted>Vlastní kód: {existing.payload}</Text>
          </Card>
        )}
      </Screen>
    );
  }

  const finalPayload = mode === 'generate' ? payload : scanned;
  const save = async () => {
    if (!finalPayload || !name.trim()) return;
    await saveQrTarget({ id: newId(), name: name.trim(), payload: finalPayload, generated: mode === 'generate', createdAt: Date.now() });
    router.back();
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton icon="close" label="Zrušit" onPress={() => router.back()} />
        <Text variant="heading">Nový QR kód</Text>
        <View style={{ width: 44 }} />
      </Row>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Kde bude kód? Např. Koupelna"
        placeholderTextColor={t.textFaint}
        maxLength={30}
        accessibilityLabel="Název QR kódu"
        style={{ backgroundColor: t.surface, color: t.text, borderRadius: radius.lg, paddingHorizontal: space.lg, minHeight: 54, fontSize: 16, borderWidth: 1, borderColor: t.border }}
      />
      <Segmented
        options={[
          { value: 'generate', label: 'Vytvořit nový' },
          { value: 'scan', label: 'Použít existující' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'generate' ? (
        <>
          <QrView payload={payload} />
          <Text variant="caption" muted center>
            Vytiskni ho (nebo vyfoť na druhý telefon) a nalep tam, kam ráno musíš dojít. Kód je náhodný a jedinečný.
          </Text>
          <Button title="Sdílet / vytisknout" icon="print-outline" kind="secondary" onPress={() => void share(payload, name)} />
        </>
      ) : !perm ? null : !perm.granted ? (
        <Button title="Povolit fotoaparát" onPress={() => void request()} />
      ) : scanned ? (
        <Card tone="accent">
          <Text variant="bodyStrong">Kód načten</Text>
          <Text variant="caption" muted numberOfLines={2}>
            {scanned}
          </Text>
          <Button title="Naskenovat znovu" kind="ghost" size="md" onPress={() => { lock.current = false; setScanned(null); }} />
        </Card>
      ) : (
        <View style={{ height: 320, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'datamatrix'] }}
            onBarcodeScanned={(r) => {
              if (lock.current) return;
              lock.current = true;
              setScanned(r.data);
            }}
          />
        </View>
      )}
      <Button title="Uložit kód" icon="checkmark" disabled={!finalPayload || !name.trim()} onPress={save} />
    </Screen>
  );
}
