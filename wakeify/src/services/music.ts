import { createAudioPlayer } from 'expo-audio';
import { getDocumentAsync } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

import type { Track } from '../domain/types';
import { newId } from './ids';

/** Formats both platforms decode natively. OGG/Opus are Android-only (checked by probing). */
export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'aif', 'aiff', 'caf', 'flac', 'ogg', 'opus', 'mp4'];

const MAX_BYTES = 200 * 1024 * 1024;

/**
 * Tracks live in <Documents>/music — persistent app storage that survives
 * restarts and reboots, is excluded from cache eviction and needs no network.
 */
export function musicDir(): Directory {
  const dir = new Directory(Paths.document, 'music');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.split('?')[0]);
  return m ? m[1].toLowerCase() : '';
}

/** "Artist - Title.mp3" → { artist, title }. */
export function titleFromFileName(name: string): { title: string; artist: string | null } {
  const base = decodeURIComponent(name.split('/').pop() ?? name)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/_/g, ' ')
    .trim();
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: null, title: base || 'Skladba' };
}

/**
 * Loads the file with the platform decoder. Resolves the duration (ms) or
 * rejects when the file cannot be played — we never store a track that would
 * fail at 6 a.m.
 */
export function probeDuration(uri: string, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const player = createAudioPlayer({ uri });
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.remove();
      try {
        player.remove();
      } catch {
        // already released
      }
      fn();
    };
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.error) finish(() => reject(new Error(s.error ?? 'Soubor nelze přehrát')));
      else if (s.isLoaded) finish(() => resolve(s.duration > 0 ? Math.round(s.duration * 1000) : null));
    });
    const timer = setTimeout(() => {
      // Some decoders load lazily; fall back to the player's own fields.
      if (player.isLoaded) finish(() => resolve(player.duration > 0 ? Math.round(player.duration * 1000) : null));
      else finish(() => reject(new Error('Soubor se nepodařilo načíst — formát možná není podporován.')));
    }, timeoutMs);
  });
}

async function finalize(file: File, originalName: string, mimeType: string | null, source: Track['source']): Promise<Track> {
  let durationMs: number | null;
  try {
    durationMs = await probeDuration(file.uri);
  } catch (e) {
    file.delete();
    throw e;
  }
  const { title, artist } = titleFromFileName(originalName);
  return {
    id: file.name.replace(/\.[^.]+$/, ''),
    title,
    artist,
    uri: file.uri,
    fileName: originalName,
    mimeType,
    sizeBytes: file.size ?? 0,
    durationMs,
    startOffsetMs: 0,
    source,
    createdAt: Date.now(),
  };
}

export type ImportResult = { tracks: Track[]; errors: { name: string; message: string }[] };

/** Lets the user pick one or more audio files and copies them into app storage. */
export async function importFromDevice(): Promise<ImportResult | null> {
  const res = await getDocumentAsync({ type: ['audio/*'], multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return null;
  const out: ImportResult = { tracks: [], errors: [] };
  const dir = musicDir();
  for (const asset of res.assets) {
    try {
      const ext = extensionOf(asset.name) || extensionOf(asset.uri);
      if (ext && !AUDIO_EXTENSIONS.includes(ext)) throw new Error(`Formát .${ext} není podporován.`);
      if ((asset.size ?? 0) > MAX_BYTES) throw new Error('Soubor je větší než 200 MB.');
      const id = newId();
      const target = new File(dir, `${id}.${ext || 'mp3'}`);
      const src = new File(asset.uri);
      await src.copy(target);
      try {
        src.delete(); // the picker's cache copy
      } catch {
        // not ours to delete on some platforms
      }
      out.tracks.push(await finalize(target, asset.name, asset.mimeType ?? null, 'import'));
    } catch (e) {
      out.errors.push({ name: asset.name, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/**
 * Downloads an audio file from a direct URL into app storage for offline use
 * (e.g. the user's own file in cloud storage). Streaming services are
 * deliberately not supported — see README "Proč ne Spotify/YouTube".
 */
export async function downloadFromUrl(url: string): Promise<Track> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new Error('Zadej platnou adresu začínající http(s)://');
  if (/spotify\.com|youtube\.com|youtu\.be|music\.apple\.com|deezer\.com|tidal\.com/i.test(trimmed)) {
    throw new Error('Streamovací služby nelze stáhnout. Použij přímý odkaz na vlastní hudební soubor.');
  }
  const ext = extensionOf(trimmed);
  const id = newId();
  const dir = musicDir();
  const target = new File(dir, `${id}.${AUDIO_EXTENSIONS.includes(ext) ? ext : 'mp3'}`);
  const file = await File.downloadFileAsync(trimmed, target);
  const type = file.type ?? '';
  if (type && !type.startsWith('audio/') && type !== 'application/octet-stream' && !type.startsWith('video/mp4')) {
    file.delete();
    throw new Error(`Odkaz nevede na zvukový soubor (${type}).`);
  }
  if ((file.size ?? 0) > MAX_BYTES) {
    file.delete();
    throw new Error('Soubor je větší než 200 MB.');
  }
  const name = decodeURIComponent(trimmed.split('?')[0].split('/').pop() || 'Stažená skladba');
  return finalize(file, name, type || null, 'download');
}

export function deleteTrackFile(track: Track): void {
  try {
    const f = new File(track.uri);
    if (f.exists) f.delete();
  } catch {
    // file already gone — DB row removal still proceeds
  }
}

export function trackFileExists(track: Track): boolean {
  try {
    return new File(track.uri).exists;
  } catch {
    return false;
  }
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return '–:––';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatSize(bytes: number): string {
  if (bytes <= 0) return '0 kB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
