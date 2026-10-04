import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Track } from '../domain/types';
import { PreviewPlayer } from '../services/audio';
import { formatDuration, importFromDevice } from '../services/music';
import { useApp } from '../state/AppProvider';
import { Button, Card, Divider, IconButton, ListRow, Row, Text } from '../ui/components';
import { space, useTheme } from '../ui/theme';

export function TrackPicker({
  visible,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { tracks, saveTrack } = useApp();
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const player = useRef(new PreviewPlayer());

  useEffect(() => {
    const p = player.current;
    if (!visible) {
      p.stop();
      setPlaying(null);
    }
    return () => p.stop();
  }, [visible]);

  const toggle = async (tr: Track) => {
    if (playing === tr.id) {
      player.current.stop();
      setPlaying(null);
      return;
    }
    setPlaying(tr.id);
    try {
      await player.current.preview(tr.uri, tr.startOffsetMs);
    } catch {
      setPlaying(null);
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const r = await importFromDevice();
      if (!r) return;
      for (const tr of r.tracks) await saveTrack(tr);
      if (r.tracks.length === 1) onSelect(r.tracks[0].id);
      if (r.errors.length) Alert.alert('Některé soubory nešly přidat', r.errors.map((e) => `${e.name}: ${e.message}`).join('\n'));
    } catch (e) {
      Alert.alert('Import selhal', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Row style={{ justifyContent: 'space-between', padding: space.lg }}>
          <Text variant="heading">Zvuk budíku</Text>
          <Button title="Hotovo" size="md" kind="secondary" onPress={onClose} />
        </Row>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.md, paddingBottom: insets.bottom + 40 }}>
          <Button title="Importovat z telefonu" icon="folder-open-outline" kind="secondary" loading={busy} onPress={doImport} />
          <Card style={{ paddingVertical: space.sm }}>
            <ListRow
              icon="notifications-outline"
              iconTone="sky"
              title="Výchozí tón Wakeify"
              subtitle="Systémový tón budíku"
              onPress={() => onSelect(null)}
              chevron={false}
              right={selectedId == null ? <Ionicons name="checkmark-circle" size={24} color={t.primary} /> : undefined}
            />
            {tracks.map((tr) => (
              <View key={tr.id}>
                <Divider />
                <ListRow
                  icon="musical-note"
                  title={tr.title}
                  subtitle={[tr.artist, formatDuration(tr.durationMs), tr.startOffsetMs ? `od ${formatDuration(tr.startOffsetMs)}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => onSelect(tr.id)}
                  chevron={false}
                  right={
                    <Row gap={space.sm}>
                      <IconButton
                        icon={playing === tr.id ? 'stop' : 'play'}
                        size={34}
                        label={playing === tr.id ? 'Zastavit ukázku' : `Přehrát ukázku ${tr.title}`}
                        onPress={() => void toggle(tr)}
                      />
                      {selectedId === tr.id ? <Ionicons name="checkmark-circle" size={24} color={t.primary} /> : <View style={{ width: 24 }} />}
                    </Row>
                  }
                />
              </View>
            ))}
          </Card>
          {tracks.length === 0 && (
            <Text variant="caption" muted center>
              Knihovna je prázdná. Importuj MP3, M4A nebo WAV — skladby se uloží do telefonu a budou hrát i bez internetu.
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
