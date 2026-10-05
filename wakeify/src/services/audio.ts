import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * In-app playback: track previews, and the ringing sound when the app itself
 * is in the foreground on iOS (full song instead of the 30 s system clip) or
 * when the native engine is unavailable (development in Expo Go).
 */
export class RingPlayer {
  private player: AudioPlayer | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;

  async start(opts: { uri: string | null; startOffsetMs: number; volume: number; fadeInSeconds: number; loop?: boolean }) {
    this.stop();
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => {});
    // Without a user track we still need a sound: the bundled gentle chime.
    const source = opts.uri ? { uri: opts.uri } : require('../../assets/sounds/chime.wav');
    const p = createAudioPlayer(source);
    this.player = p;
    this.stopped = false;
    p.loop = opts.loop ?? true;
    const target = Math.min(1, Math.max(0.05, opts.volume));
    p.volume = opts.fadeInSeconds > 0 ? 0.05 : target;
    if (opts.startOffsetMs > 0 && opts.uri) {
      await p.seekTo(opts.startOffsetMs / 1000).catch(() => {});
    }
    p.play();
    if (opts.fadeInSeconds > 0) {
      const started = Date.now();
      this.fadeTimer = setInterval(() => {
        const k = Math.min(1, (Date.now() - started) / (opts.fadeInSeconds * 1000));
        if (this.player) this.player.volume = 0.05 + (target - 0.05) * k;
        if (k >= 1 && this.fadeTimer) {
          clearInterval(this.fadeTimer);
          this.fadeTimer = null;
        }
      }, 250);
    }
  }

  /**
   * Resumes playback if something (a system alarm alert, a call, Siri) paused
   * it. No-op when stopped on purpose or already playing; keeps the fade level.
   */
  ensurePlaying() {
    const p = this.player;
    if (!p || this.stopped) return;
    try {
      if (!p.playing) p.play();
    } catch {
      // player released
    }
  }

  setVolume(v: number) {
    if (this.player) this.player.volume = v;
  }

  stop() {
    this.stopped = true;
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
    if (this.player) {
      try {
        this.player.pause();
        this.player.remove();
      } catch {
        // released
      }
    }
    this.player = null;
  }

  get playing(): boolean {
    return this.player?.playing ?? false;
  }
}

/** Short preview from the chosen start offset (stops automatically). */
export class PreviewPlayer extends RingPlayer {
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  async preview(uri: string, startOffsetMs: number, volume = 0.8, seconds = 12) {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    await this.start({ uri, startOffsetMs, volume, fadeInSeconds: 0, loop: false });
    this.stopTimer = setTimeout(() => this.stop(), seconds * 1000);
  }

  override stop() {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    super.stop();
  }
}
