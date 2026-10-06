import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Image, View } from 'react-native';

import type { Difficulty, PhotoTarget } from '../../domain/types';
import { analyzePhoto } from '../../services/photo';
import { THRESHOLDS, bestMatch, parseFeatures, qualityIssue, type FeatureVector } from '../../vision/features';
import { Button, Row, Text } from '../../ui/components';
import { radius, space, useTheme } from '../../ui/theme';

const ISSUE_TEXT = {
  tooDark: 'Fotka je moc tmavá. Rozsviť nebo jdi k oknu.',
  tooBright: 'Fotka je přepálená.',
  noDetail: 'Na fotce nic není — zaměř předmět celý.',
};

export function PhotoChallenge({
  target,
  strictness,
  onDone,
  onAlternative,
}: {
  target: PhotoTarget | undefined;
  strictness: Difficulty;
  onDone: () => void;
  onAlternative: () => void;
}) {
  const t = useTheme();
  const [perm, request] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const refs = (target?.features ?? []).map(parseFeatures).filter((f): f is FeatureVector => f != null);

  if (!target || refs.length === 0) {
    return (
      <View style={{ gap: space.md, alignItems: 'center' }}>
        <Text variant="heading" center>Předmět k vyfocení chybí</Text>
        <Button title="Alternativní ověření" onPress={onAlternative} />
      </View>
    );
  }
  if (!perm) return <Text muted center>Připravuji fotoaparát…</Text>;
  if (!perm.granted) {
    return (
      <View style={{ gap: space.md, alignItems: 'center' }}>
        <Text center>Pro ověření fotkou potřebuji fotoaparát.</Text>
        <Button title="Povolit fotoaparát" onPress={() => void request()} />
        <Button title="Alternativní ověření" kind="secondary" onPress={onAlternative} />
      </View>
    );
  }

  const shoot = async () => {
    if (!cam.current || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.6, shutterSound: false });
      const f = await analyzePhoto(pic.uri);
      const issue = qualityIssue(f);
      if (issue) {
        setMsg({ text: ISSUE_TEXT[issue], ok: false });
        setAttempts((a) => a + 1);
        return;
      }
      const m = bestMatch(f, refs)!;
      const pct = Math.round(m.score * 100);
      if (m.score >= THRESHOLDS[strictness]) {
        setMsg({ text: `Shoda ${pct} % — výborně!`, ok: true });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setTimeout(onDone, 500);
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setMsg({ text: `Shoda jen ${pct} % (potřeba ${Math.round(THRESHOLDS[strictness] * 100)} %). Vyfoť to ze stejného místa jako předlohu.`, ok: false });
        setAttempts((a) => a + 1);
      }
    } catch (e) {
      setMsg({ text: `Focení selhalo: ${e instanceof Error ? e.message : String(e)}`, ok: false });
      setAttempts((a) => a + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md, width: '100%' }}>
      <Row gap={space.md}>
        <Image source={{ uri: target.imageUris[0] }} style={{ width: 64, height: 64, borderRadius: radius.md }} accessibilityLabel={`Předloha ${target.name}`} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Vyfoť: {target.name}</Text>
          <Text variant="caption" muted>Stejný záběr jako na předloze.</Text>
        </View>
      </Row>
      <View style={{ height: 380, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#000' }}>
        <CameraView ref={cam} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />
      </View>
      {msg && (
        <Text color={msg.ok ? t.accent : t.danger} center accessibilityLiveRegion="assertive">
          {msg.text}
        </Text>
      )}
      <Button title={busy ? 'Porovnávám…' : 'Vyfotit'} icon="camera" loading={busy} disabled={!ready} onPress={shoot} />
      {attempts >= 3 && <Button title="Nedaří se? Alternativní ověření" kind="secondary" size="md" onPress={onAlternative} />}
    </View>
  );
}
