import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { qrMatches } from '../../domain/qr';
import type { QrTarget } from '../../domain/types';
import { Button, Text } from '../../ui/components';
import { radius, space, useTheme } from '../../ui/theme';

export function QrChallenge({ target, onDone, onAlternative }: { target: QrTarget | undefined; onDone: () => void; onAlternative: () => void }) {
  const t = useTheme();
  const [perm, request] = useCameraPermissions();
  const [msg, setMsg] = useState<string | null>(null);
  const done = useRef(false);
  const lastWrong = useRef(0);

  if (!target) {
    return (
      <View style={{ gap: space.md, alignItems: 'center' }}>
        <Text variant="heading" center>QR kód byl smazán</Text>
        <Button title="Alternativní ověření" onPress={onAlternative} />
      </View>
    );
  }
  if (!perm) return <Text muted center>Připravuji fotoaparát…</Text>;
  if (!perm.granted) {
    return (
      <View style={{ gap: space.md, alignItems: 'center' }}>
        <Text center>Ke skenování QR kódu potřebuji fotoaparát.</Text>
        <Button title="Povolit fotoaparát" onPress={() => void request()} />
        <Button title="Alternativní ověření" kind="secondary" onPress={onAlternative} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.md, width: '100%' }}>
      <Text muted center>
        Dojdi ke kódu „{target.name}“ a naskenuj ho.
      </Text>
      <View style={{ height: 360, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#000' }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'datamatrix'] }}
          onBarcodeScanned={(r) => {
            if (done.current) return;
            if (qrMatches(target.payload, r.data)) {
              done.current = true;
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              onDone();
            } else if (Date.now() - lastWrong.current > 1500) {
              lastWrong.current = Date.now();
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
              setMsg('Tohle je jiný kód. Hledej ten svůj.');
            }
          }}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: '20%', left: '20%', right: '20%', bottom: '20%', borderWidth: 3, borderColor: t.primary, borderRadius: radius.lg }}
        />
      </View>
      {msg && <Text color={t.danger} center accessibilityLiveRegion="assertive">{msg}</Text>}
      <Button title="Kód nemám u sebe" kind="ghost" size="md" onPress={onAlternative} />
    </View>
  );
}
