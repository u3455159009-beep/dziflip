import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Image, TextInput, View } from 'react-native';

import { newId } from '../../services/ids';
import { analyzePhoto, deleteStoredPhotos, storeReferencePhoto } from '../../services/photo';
import { useApp } from '../../state/AppProvider';
import { THRESHOLDS, compareFeatures, qualityIssue, serializeFeatures, type FeatureVector } from '../../vision/features';
import { Button, Chip, IconButton, Row, Screen, Text } from '../../ui/components';
import { radius, space, useTheme } from '../../ui/theme';

const SUGGESTIONS = ['Umyvadlo', 'Zrcadlo', 'Kávovar', 'Zubní kartáček', 'Okno', 'Obloha', 'Lednice'];
const MAX_REFS = 3;

type Shot = { uri: string; features: FeatureVector };

export default function NewPhotoTarget() {
  const t = useTheme();
  const { savePhotoTarget } = useApp();
  const [perm, request] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [name, setName] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const capture = async () => {
    if (!cam.current || busy) return;
    setBusy(true);
    setHint(null);
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.7, shutterSound: false });
      const features = await analyzePhoto(pic.uri);
      const issue = qualityIssue(features);
      if (issue) {
        setHint(issue === 'tooDark' ? 'Moc tma — ráno to bude podobné? Raději rozsviť.' : 'Na fotce je málo detailů. Zaměř předmět i s okolím.');
        return;
      }
      if (shots.length) {
        const best = Math.max(...shots.map((s) => compareFeatures(features, s.features).score));
        if (best < THRESHOLDS.easy) setHint('Tahle předloha se od předchozích hodně liší — jde opravdu o stejný předmět?');
      }
      const uri = await storeReferencePhoto(pic.uri);
      setShots((s) => [...s, { uri, features }]);
    } catch (e) {
      Alert.alert('Focení selhalo', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!name.trim() || shots.length === 0) return;
    await savePhotoTarget({
      id: newId(),
      name: name.trim(),
      imageUris: shots.map((s) => s.uri),
      features: shots.map((s) => serializeFeatures(s.features)),
      createdAt: Date.now(),
    });
    router.back();
  };

  const cancel = () => {
    deleteStoredPhotos(shots.map((s) => s.uri));
    router.back();
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton icon="close" label="Zrušit" onPress={cancel} />
        <Text variant="heading">Nový předmět</Text>
        <View style={{ width: 44 }} />
      </Row>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Název, např. Umyvadlo"
        placeholderTextColor={t.textFaint}
        maxLength={30}
        accessibilityLabel="Název předmětu"
        style={{ backgroundColor: t.surface, color: t.text, borderRadius: radius.lg, paddingHorizontal: space.lg, minHeight: 54, fontSize: 16, borderWidth: 1, borderColor: t.border }}
      />
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {SUGGESTIONS.map((s) => (
          <Chip key={s} label={s} selected={name === s} onPress={() => setName(s)} />
        ))}
      </Row>
      <Text variant="caption" muted>
        Vyfoť předmět tak, jak ho ráno uvidíš — ze stejného místa a podobně zblízka. 2–3 předlohy z mírně jiných úhlů zvýší spolehlivost.
        Porovnání probíhá jen v telefonu.
      </Text>
      {!perm ? null : !perm.granted ? (
        <Button title="Povolit fotoaparát" onPress={() => void request()} />
      ) : shots.length < MAX_REFS ? (
        <View style={{ height: 360, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#000' }}>
          <CameraView ref={cam} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />
        </View>
      ) : null}
      {hint && <Text color={t.warm}>{hint}</Text>}
      {shots.length < MAX_REFS && perm?.granted && (
        <Button
          title={shots.length ? `Přidat předlohu (${shots.length}/${MAX_REFS})` : 'Vyfotit předlohu'}
          icon="camera"
          kind={shots.length ? 'secondary' : 'primary'}
          loading={busy}
          disabled={!ready}
          onPress={capture}
        />
      )}
      {shots.length > 0 && (
        <Row gap={space.sm}>
          {shots.map((s, i) => (
            <View key={s.uri}>
              <Image source={{ uri: s.uri }} style={{ width: 96, height: 128, borderRadius: radius.md }} accessibilityLabel={`Předloha ${i + 1}`} />
              <View style={{ position: 'absolute', top: 4, right: 4 }}>
                <IconButton
                  icon="close"
                  size={28}
                  label={`Odebrat předlohu ${i + 1}`}
                  onPress={() => {
                    deleteStoredPhotos([s.uri]);
                    setShots((x) => x.filter((y) => y.uri !== s.uri));
                  }}
                />
              </View>
            </View>
          ))}
        </Row>
      )}
      <Button title="Uložit předmět" icon="checkmark" disabled={!name.trim() || shots.length === 0} onPress={save} />
    </Screen>
  );
}
