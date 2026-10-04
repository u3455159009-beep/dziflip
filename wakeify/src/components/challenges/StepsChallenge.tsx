import { Accelerometer, Pedometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { StepDetector } from '../../domain/stepDetector';
import { Button, Text } from '../../ui/components';
import { space } from '../../ui/theme';
import { ProgressRing } from './ProgressRing';

type Source = 'pedometer' | 'accelerometer' | 'none' | 'loading';

/**
 * Walk N steps. Prefers the OS step counter (hardware, battery-friendly);
 * falls back to our own accelerometer step detector when the counter is
 * missing or motion permission was denied.
 */
export function StepsChallenge({ target, onDone, onUnavailable }: { target: number; onDone: () => void; onUnavailable: () => void }) {
  const [steps, setSteps] = useState(0);
  const [source, setSource] = useState<Source>('loading');
  const done = useRef(false);
  // Parent callbacks change identity on every app-state update; keep the
  // sensor subscription (and its step count) alive across those renders.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let alive = true;
    const report = (n: number) => {
      if (!alive) return;
      setSteps(n);
      if (n >= target && !done.current) {
        done.current = true;
        onDoneRef.current();
      }
    };
    (async () => {
      try {
        const available = await Pedometer.isAvailableAsync();
        const perm = available ? await Pedometer.requestPermissionsAsync() : null;
        if (available && perm?.granted) {
          const sub = Pedometer.watchStepCount((r) => report(r.steps));
          cleanup = () => sub.remove();
          if (alive) setSource('pedometer');
          return;
        }
      } catch {
        // fall through to accelerometer
      }
      try {
        if (await Accelerometer.isAvailableAsync()) {
          const det = new StepDetector();
          Accelerometer.setUpdateInterval(20);
          const sub = Accelerometer.addListener((m) => report(det.push({ x: m.x, y: m.y, z: m.z, t: Date.now() })));
          cleanup = () => sub.remove();
          if (alive) setSource('accelerometer');
          return;
        }
      } catch {
        // none
      }
      if (alive) setSource('none');
    })();
    return () => {
      alive = false;
      cleanup?.();
    };
  }, [target]);

  if (source === 'none') {
    return (
      <View style={{ alignItems: 'center', gap: space.md }}>
        <Text variant="heading" center>
          Krokoměr není dostupný
        </Text>
        <Text muted center>
          Telefon nemá snímač pohybu nebo k němu chybí oprávnění. Ověř probuzení jinak.
        </Text>
        <Button title="Alternativní ověření" onPress={onUnavailable} />
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', gap: space.lg }}>
      <ProgressRing progress={steps / target}>
        <Text style={{ fontSize: 56, fontWeight: '200', fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">
          {Math.min(steps, target)}
        </Text>
        <Text muted>z {target} kroků</Text>
      </ProgressRing>
      <Text muted center>
        {source === 'loading' ? 'Spouštím krokoměr…' : 'Vstaň a choď s telefonem v ruce nebo v kapse.'}
      </Text>
      {source === 'accelerometer' && (
        <Text variant="caption" faint center>
          Počítám kroky z akcelerometru (systémový krokoměr není k dispozici).
        </Text>
      )}
    </View>
  );
}
