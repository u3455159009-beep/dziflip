import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import type { Track } from '../../domain/types';
import { PreviewPlayer } from '../../services/audio';
import { deleteTrackFile, downloadFromUrl, formatDuration, formatSize, importFromDevice, trackFileExists } from '../../services/music';
import { useApp } from '../../state/AppProvider';
import { Button, Card, Divider, EmptyState, FadeIn, IconButton, ListRow, Notice, Row, Screen, SectionHeader, Text } from '../../ui/components';
import { radius, space, useTheme } from '../../ui/theme';

export default function Library() {
  const t = useTheme();
  const { tracks, alarms, saveTrack, removeTrack } = useApp();
  const [busy, setBusy] = useState<'import' | 'download' | null>(null);
  const [url, setUrl] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const player = useRef(new PreviewPlayer());
  useEffect(() => {
    const p = player.current;
    return () => p.stop();
  }, []);

  const totalBytes = tracks.reduce((s, x) => s + x.sizeBytes, 0);
  const missing = tracks.filter((x) => !trackFileExists(x));

  const doImport = async () => {
    setBusy('import');
    try {
      const r = await importFromDevice();
      if (!r) return;
      for (const tr of r.tracks) await saveTrack(tr);
      if (r.errors.length) Alert.alert('Některé soubory nešly přidat', r.errors.map((e) => `${e.name}: ${e.message}`).join('\n'));
    } catch (e) {
      Alert.alert('Import selhal', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doDownload = async () => {
    setBusy('download');
    try {
      const tr = await downloadFromUrl(url);
      await saveTrack(tr);
      setUrl('');
      setShowUrl(false);
    } catch (e) {
      Alert.alert('Stažení selhalo', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (tr: Track) => {
    if (playing === tr.id) {
      player.current.stop();
      setPlaying(null);
      return;
    }
    setPlaying(tr.id);
    await player.current.preview(tr.uri, tr.startOffsetMs).catch(() => setPlaying(null));
  };

  const remove = (tr: Track) => {
    const used = alarms.filter((a) => a.trackId === tr.id).length;
    Alert.alert(
      'Smazat skladbu?',
      used ? `Používá ji ${used} ${used === 1 ? 'budík' : 'budíky'} — ty pak zazvoní výchozím tónem.` : tr.title,
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Smazat',
          style: 'destructive',
          onPress: async () => {
            if (playing === tr.id) player.current.stop();
            await removeTrack(tr.id);
            deleteTrackFile(tr);
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <FadeIn>
        <Text variant="title" accessibilityRole="header">
          Hudba
        </Text>
        <Text muted style={{ marginTop: 4 }}>
          {tracks.length} {tracks.length === 1 ? 'skladba' : tracks.length >= 2 && tracks.length <= 4 ? 'skladby' : 'skladeb'} · {formatSize(totalBytes)} · vše offline
        </Text>
      </FadeIn>

      <Row gap={space.sm}>
        <Button title="Importovat" icon="folder-open-outline" style={{ flex: 1 }} loading={busy === 'import'} onPress={doImport} />
        <Button title="Z odkazu" icon="cloud-download-outline" kind="secondary" style={{ flex: 1 }} onPress={() => setShowUrl((v) => !v)} />
      </Row>

      {showUrl && (
        <Card style={{ gap: space.md }}>
          <Text variant="caption" muted>
            Přímý odkaz na tvůj zvukový soubor (MP3, M4A, WAV). Skladba se stáhne do telefonu a bude hrát i v režimu letadlo.
          </Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://…/moje-pisnicka.mp3"
            placeholderTextColor={t.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Adresa zvukového souboru"
            style={{ backgroundColor: t.surfaceAlt, color: t.text, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48 }}
          />
          <Button title="Stáhnout" size="md" loading={busy === 'download'} disabled={!url.trim()} onPress={doDownload} />
        </Card>
      )}

      {missing.length > 0 && (
        <Notice
          tone="danger"
          icon="alert-circle-outline"
          title="Chybějící soubory"
          text={`${missing.map((m) => m.title).join(', ')} — soubor už v telefonu není. Budík by zazněl výchozím tónem; skladbu importuj znovu.`}
        />
      )}

      {tracks.length === 0 ? (
        <EmptyState
          icon="musical-notes-outline"
          title="Tvoje ranní hudba"
          text="Importuj oblíbené skladby z telefonu. Uloží se do aplikace a zahrají i bez internetu, po restartu i v režimu letadlo."
        />
      ) : (
        <>
          <SectionHeader title="Knihovna" />
          <Card style={{ paddingVertical: space.sm }}>
            {tracks.map((tr, i) => {
              const used = alarms.filter((a) => a.trackId === tr.id).length;
              return (
                <View key={tr.id}>
                  {i > 0 && <Divider />}
                  <ListRow
                    icon="musical-note"
                    title={tr.title}
                    subtitle={[
                      tr.artist,
                      formatDuration(tr.durationMs),
                      formatSize(tr.sizeBytes),
                      tr.startOffsetMs ? `start ${formatDuration(tr.startOffsetMs)}` : null,
                      used ? `${used}× v budíku` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onPress={() => router.push(`/track/${tr.id}`)}
                    chevron={false}
                    right={
                      <Row gap={4}>
                        <IconButton
                          icon={playing === tr.id ? 'stop' : 'play'}
                          size={36}
                          label={playing === tr.id ? 'Zastavit' : `Přehrát ${tr.title}`}
                          onPress={() => void toggle(tr)}
                        />
                        <IconButton icon="trash-outline" tone="plain" size={36} label={`Smazat ${tr.title}`} onPress={() => remove(tr)} />
                      </Row>
                    }
                  />
                </View>
              );
            })}
          </Card>
        </>
      )}

      <Card tone="alt">
        <Row align="flex-start">
          <Ionicons name="airplane-outline" size={20} color={t.textMuted} />
          <Text variant="caption" muted style={{ flex: 1 }}>
            Wakeify nikdy nestreamuje. Spotify, YouTube a další služby neumožňují spolehlivé přehrávání na pozadí ani offline mimo
            vlastní aplikace — proto budík hraje jen soubory uložené přímo v telefonu.
          </Text>
        </Row>
      </Card>
    </Screen>
  );
}
