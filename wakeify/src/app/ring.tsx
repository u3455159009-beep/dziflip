import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoldChallenge } from '../components/challenges/HoldChallenge';
import { MathChallenge } from '../components/challenges/MathChallenge';
import { PhotoChallenge } from '../components/challenges/PhotoChallenge';
import { QrChallenge } from '../components/challenges/QrChallenge';
import { StepsChallenge } from '../components/challenges/StepsChallenge';
import { canSnooze, shouldShowRing, snoozesLeft, type RingSession } from '../domain/ringSession';
import { kindLabel, resolveChallenge, stepLabel } from '../domain/rotation';
import { formatTime } from '../domain/schedule';
import type { Alarm, Challenge, ChallengeKind, ChallengeStep } from '../domain/types';
import {
  getActiveRing,
  onRingStarted,
  onRingStopped,
  playsInAppWhileRinging,
  setShowOverLockScreen,
  stopRinging,
} from '../services/alarmEngine';
import { RingPlayer } from '../services/audio';
import { getDb } from '../services/database';
import { abandon, beginRing, complete, finishTestRing, getSession, markChallengeStarted, ringUi, snooze } from '../services/ringFlow';
import { useApp } from '../state/AppProvider';
import { Button, Row, Text } from '../ui/components';
import { radius, space, useTheme } from '../ui/theme';

async function getSessionSafe(db: Awaited<ReturnType<typeof getDb>>) {
  try {
    return await getSession(db);
  } catch {
    return null;
  }
}

/** Replacement when a step can't be done (camera denied, code lost, no sensor): harder maths. */
const ALTERNATIVE: ChallengeStep = { kind: 'math', count: 5, difficulty: 'hard' };

type Phase =
  | { kind: 'loading' }
  | { kind: 'idle' } // nothing ringing
  | { kind: 'ringing' }
  | { kind: 'challenge'; index: number };

export default function Ring() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ demo?: string; alarmId?: string }>();
  const [isTest, setIsTest] = useState(false);
  const demo = params.demo === '1';
  /** Demo (from settings) and test rings exercise the UI but leave no trace in history. */
  const dryRun = demo || isTest;
  const app = useApp();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [alarm, setAlarm] = useState<Alarm | null>(null);
  const [session, setSession] = useState<RingSession | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [now, setNow] = useState(new Date());
  const player = useRef(new RingPlayer());
  const finished = useRef(false);
  const alarmIdRef = useRef<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Block the hardware back button while ringing.
  useEffect(() => {
    ringUi.open = true;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    setShowOverLockScreen(true);
    // Screen stays on while ringing / solving the challenge.
    const awake = activateKeepAwakeAsync('wakeify-ring').catch(() => {});
    const p = player.current;
    return () => {
      ringUi.open = false;
      sub.remove();
      setShowOverLockScreen(false);
      p.stop();
      void awake.then(() => deactivateKeepAwake('wakeify-ring')).catch(() => {});
    };
  }, []);

  // Load the ring (native truth) and the session.
  useEffect(() => {
    if (!app.ready) return;
    let alive = true;
    (async () => {
      const db = await getDb();
      let ring = await getActiveRing();
      if (!ring && demo && params.alarmId) {
        ring = { alarmId: params.alarmId, startedAt: Date.now(), scheduledFor: Date.now(), isSnooze: false, isTest: false, usingFallbackSound: false };
      }
      if (ring && !demo && !shouldShowRing(await getSessionSafe(db), ring, Date.now())) ring = null;
      const a = ring ? app.alarms.find((x) => x.id === ring!.alarmId) ?? null : null;
      if (!alive) return;
      if (!ring || !a) {
        if (ring && !a) await stopRinging(); // alarm was deleted meanwhile
        setPhase({ kind: 'idle' });
        return;
      }
      const testRing = !demo && ring.isTest === true;
      setIsTest(testRing);
      const s: RingSession =
        demo || testRing
          ? { eventId: 'dry-run', alarmId: a.id, scheduledFor: ring.scheduledFor, firstRingAt: ring.startedAt, snoozeCount: 0, challengeStartedAt: null }
          : await beginRing(db, a, ring);
      const ch = resolveChallenge(a.plan, a.id, new Date(s.scheduledFor));
      if (!alive) return;
      alarmIdRef.current = a.id;
      setAlarm(a);
      setSession(s);
      setChallenge(ch);
      setPhase({ kind: 'ringing' });
      if (playsInAppWhileRinging) {
        // iOS: silence the 29 s system clip, play the whole song in-app.
        if (!demo) await stopRinging();
        const tr = app.tracks.find((x) => x.id === a.trackId);
        await player.current
          .start({ uri: tr?.uri ?? null, startOffsetMs: tr?.startOffsetMs ?? 0, volume: a.volume, fadeInSeconds: a.fadeInSeconds })
          .catch(() => {});
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.ready]);

  // iOS: a backup re-alarm of the alarm being handled here fires while the
  // ring screen is open → silence the system clip, the in-app song keeps playing.
  useEffect(
    () =>
      onRingStarted((e) => {
        if (playsInAppWhileRinging && !finished.current && e.alarmId === alarmIdRef.current) void stopRinging();
      }),
    [],
  );

  // Native ring timed out (maxRingMinutes) → it's a missed wake-up.
  useEffect(
    () =>
      onRingStopped((e) => {
        if (e.reason === 'timeout' && !finished.current) {
          player.current.stop();
          void getDb().then(abandon);
          app.historyChanged();
          router.replace('/');
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const steps = useMemo(() => challenge?.steps ?? [], [challenge]);

  const finish = useCallback(async () => {
    if (!alarm || !session || finished.current) return;
    finished.current = true;
    player.current.stop();
    if (dryRun) {
      if (isTest) await finishTestRing(alarm.id);
      router.replace('/welcome?demo=1');
      return;
    }
    const db = await getDb();
    const kinds = [...new Set(steps.map((s) => s.kind))] as ChallengeKind[];
    const ev = await complete(db, alarm, session, kinds, fallbackUsed ? 'fallback' : 'success');
    app.historyChanged();
    // One-shot alarms are disabled natively after ringing; mirror it so the
    // next sync does not re-arm them for tomorrow.
    if (alarm.weekdays.length === 0) await app.setAlarmEnabled(alarm.id, false);
    else void app.resync();
    router.replace(`/welcome?eventId=${ev.id}`);
  }, [alarm, session, steps, dryRun, isTest, fallbackUsed, app]);

  const startChallenge = async () => {
    if (session && !dryRun) setSession(await markChallengeStarted(await getDb(), session));
    if (steps.length === 0) void finish();
    else setPhase({ kind: 'challenge', index: 0 });
  };

  /** Advances only if `fromIndex` is still the current step (double-callbacks can't skip a step). */
  const nextStep = useCallback((fromIndex: number) => {
    setPhase((p) => {
      if (p.kind !== 'challenge' || p.index !== fromIndex) return p;
      if (p.index + 1 >= steps.length) {
        void finish();
        return p;
      }
      return { kind: 'challenge', index: p.index + 1 };
    });
  }, [steps.length, finish]);

  const useAlternative = useCallback(() => {
    if (phase.kind !== 'challenge' || !challenge) return;
    const index = phase.index;
    setFallbackUsed(true);
    setChallenge({ steps: challenge.steps.map((s, i) => (i === index ? ALTERNATIVE : s)) });
  }, [challenge, phase]);

  const doSnooze = async () => {
    if (!alarm || !session) return;
    player.current.stop();
    if (dryRun) {
      if (isTest) await finishTestRing(alarm.id);
      router.replace('/');
      return;
    }
    try {
      const r = await snooze(await getDb(), alarm, session);
      if (r) {
        finished.current = true;
        app.historyChanged();
        router.replace('/');
        const d = new Date(r.until);
        setTimeout(() => Alert.alert('Odloženo', `Budík znovu zazvoní v ${formatTime(d.getHours(), d.getMinutes())}.`), 400);
      }
    } catch (e) {
      Alert.alert('Odložení selhalo', e instanceof Error ? e.message : String(e));
    }
  };

  if (phase.kind === 'loading') {
    return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  }

  if (phase.kind === 'idle') {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg }}>
        <Ionicons name="checkmark-circle-outline" size={56} color={t.accent} />
        <Text variant="heading" center>
          Žádný budík teď nezvoní
        </Text>
        <Button title="Zpět" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const gradient = [t.heroFrom, t.heroTo, t.bg] as const;

  if (phase.kind === 'ringing' && alarm && session) {
    const left = snoozesLeft(alarm, session);
    const track = app.tracks.find((x) => x.id === alarm.trackId);
    return (
      <LinearGradient colors={gradient} style={{ flex: 1, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl }}>
        <View style={{ flex: 1, alignItems: 'center', gap: space.md }}>
          <Text variant="overline" color="rgba(255,255,255,0.75)">
            {demo ? 'Ukázka zvonění' : isTest ? 'Zkušební budík' : session.snoozeCount > 0 ? `Po ${session.snoozeCount}. odložení` : 'Dobré ráno'}
          </Text>
          <Text style={{ fontSize: 96, fontWeight: '200', color: '#FFFFFF', letterSpacing: -3, fontVariant: ['tabular-nums'] }} accessibilityRole="header">
            {formatTime(now.getHours(), now.getMinutes())}
          </Text>
          <Text variant="heading" color="#FFFFFF">
            {alarm.label || 'Budík'}
          </Text>
          <Row gap={space.sm} style={{ marginTop: space.sm }}>
            <Ionicons name="musical-note" size={16} color="rgba(255,255,255,0.8)" />
            <Text variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1}>
              {track?.title ?? 'Výchozí tón'}
            </Text>
          </Row>
          <View style={{ marginTop: space.xl, padding: space.lg, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.1)', width: '100%', gap: 6 }}>
            <Text variant="overline" color="rgba(255,255,255,0.7)">
              Pro vypnutí
            </Text>
            {steps.map((s, i) => (
              <Text key={i} variant="bodyStrong" color="#FFFFFF">
                {steps.length > 1 ? `${i + 1}. ` : ''}
                {stepLabel(s)}
              </Text>
            ))}
          </View>
        </View>
        <View style={{ gap: space.md }}>
          {canSnooze(alarm, session) && (
            <Button
              title={`Odložit o ${alarm.snoozeMinutes} min (${left}×)`}
              kind="secondary"
              icon="time-outline"
              onPress={doSnooze}
            />
          )}
          <Button title="Vstávám" icon="sunny-outline" onPress={startChallenge} accessibilityHint="Spustí úkol, kterým budík vypneš" />
        </View>
      </LinearGradient>
    );
  }

  if (phase.kind === 'challenge' && alarm) {
    const step = steps[phase.index];
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.lg, gap: space.lg, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="overline" muted>
              {steps.length > 1 ? `Úkol ${phase.index + 1} / ${steps.length}` : 'Úkol'} · {kindLabel(step.kind)}
            </Text>
            <Text variant="caption" muted style={{ fontVariant: ['tabular-nums'] }}>
              {formatTime(now.getHours(), now.getMinutes())}
            </Text>
          </Row>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.lg }}>
            {step.kind === 'none' && <HoldChallenge onDone={() => nextStep(phase.index)} />}
            {step.kind === 'math' && <MathChallenge key={`${phase.index}-${step.difficulty}`} count={step.count} difficulty={step.difficulty} onDone={() => nextStep(phase.index)} />}
            {step.kind === 'steps' && <StepsChallenge key={phase.index} target={step.steps} onDone={() => nextStep(phase.index)} onUnavailable={useAlternative} />}
            {step.kind === 'qr' && (
              <QrChallenge key={phase.index} target={app.qrTargets.find((q) => q.id === step.qrTargetId)} onDone={() => nextStep(phase.index)} onAlternative={useAlternative} />
            )}
            {step.kind === 'photo' && (
              <PhotoChallenge
                key={phase.index}
                target={app.photoTargets.find((p) => p.id === step.photoTargetId)}
                strictness={step.strictness}
                onDone={() => nextStep(phase.index)}
                onAlternative={useAlternative}
              />
            )}
          </View>
          {phase.index === 0 && canSnooze(alarm, session!) && (
            <Button title="Zpět (odložit)" kind="ghost" size="md" onPress={() => setPhase({ kind: 'ringing' })} />
          )}
        </ScrollView>
      </View>
    );
  }

  return <View style={{ flex: 1, backgroundColor: t.bg }} />;
}
