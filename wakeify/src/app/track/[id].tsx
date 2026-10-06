import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, TextInput } from 'react-native';

import { PreviewPlayer } from '../../services/audio';
import { formatDuration } from '../../services/music';
import { useApp } from '../../state/AppProvider';
import { Button, Card, IconButton, Row, Screen, SectionHeader, Text } from '../../ui/components';
import { Slider } from '../../ui/controls';
import { radius, space, useTheme } from '../../ui/theme';

export default function TrackDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tracks, saveTrack } = useApp();
  const track = tracks.find((x) => x.id === id);
  const [title, setTitle] = useState(track?.title ?? '');
  const [artist, setArtist] = useState(track?.artist ?? '');
  const [offset, setOffset] = useState(track?.startOffsetMs ?? 0);
  const [playing, setPlaying] = useState(false);
  const player = useRef(new PreviewPlayer());
  useEffect(() => {
    const p = player.current;
    return () => p.stop();
  }, []);

  if (!track) {
    return (
      <Screen>
        <Text variant="title">Skladba nenalezena</Text>
        <Button title="Zpět" onPress={() => router.back()} />
      </Screen>
    );
  }
  const max = Math.max(1000, (track.durationMs ?? 5 * 60000) - 5000);

  const preview = async () => {
    if (playing) {
      player.current.stop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    await player.current.preview(track.uri, offset, 0.8, 15).catch(() => {});
    setTimeout(() => setPlaying(false), 15000);
  };

  const save = async () => {
    try {
      await saveTrack({ ...track, title: title.trim() || track.title, artist: artist.trim() || null, startOffsetMs: Math.round(offset) });
      router.back();
    } catch (e) {
      Alert.alert('Uložení selhalo', e instanceof Error ? e.message : String(e));
    }
  };

  const input = {
    backgroundColor: t.surfaceAlt,
    color: t.text,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 48,
    fontSize: 16,
  } as const;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton icon="chevron-back" label="Zpět" onPress={() => router.back()} />
        <Text variant="heading">Skladba</Text>
        <IconButton icon="checkmark" tone="primary" label="Uložit" onPress={save} />
      </Row>

      <SectionHeader title="Začátek přehrávání" />
      <Card style={{ gap: space.md }}>
        <Text variant="hero" center style={{ fontVariant: ['tabular-nums'] }}>
          {formatDuration(offset)}
        </Text>
        <Slider
          value={offset}
          onChange={setOffset}
          min={0}
          max={max}
          step={1000}
          label="Začátek skladby"
          format={(v) => formatDuration(v)}
        />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="caption" faint>0:00</Text>
          <Text variant="caption" faint>{formatDuration(track.durationMs)}</Text>
        </Row>
        <Row gap={space.sm}>
          <Button title="−5 s" kind="secondary" size="md" style={{ flex: 1 }} onPress={() => setOffset((o) => Math.max(0, o - 5000))} />
          <Button title={playing ? 'Stop' : 'Ukázka'} icon={playing ? 'stop' : 'play'} size="md" style={{ flex: 1.4 }} onPress={preview} />
          <Button title="+5 s" kind="secondary" size="md" style={{ flex: 1 }} onPress={() => setOffset((o) => Math.min(max, o + 5000))} />
        </Row>
        {Platform.OS === 'ios' && (
          <Text variant="caption" muted>
            Na iOS systémový budík (AlarmKit) přehraje 29s úryvek od tohoto místa. Jakmile otevřeš Wakeify, hraje celá skladba.
          </Text>
        )}
      </Card>

      <SectionHeader title="Údaje" />
      <Card style={{ gap: space.md }}>
        <TextInput value={title} onChangeText={setTitle} placeholder="Název" placeholderTextColor={t.textFaint} style={input} accessibilityLabel="Název skladby" />
        <TextInput value={artist} onChangeText={setArtist} placeholder="Interpret" placeholderTextColor={t.textFaint} style={input} accessibilityLabel="Interpret" />
        <Text variant="caption" faint>
          Soubor: {track.fileName}
        </Text>
      </Card>
      <Button title="Uložit" icon="checkmark" onPress={save} />
    </Screen>
  );
}
