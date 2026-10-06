import * as Haptics from 'expo-haptics';
import { useMemo, useRef, useState } from 'react';
import { Animated, View } from 'react-native';

import { checkAnswer, generateProblems } from '../../domain/math';
import type { Difficulty } from '../../domain/types';
import { PressableScale, Row, Text } from '../../ui/components';
import { radius, space, useTheme } from '../../ui/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '−', '0', '⌫'];

/** Solve `count` random problems. Custom keypad: big targets for sleepy fingers, no keyboard jumps. */
export function MathChallenge({ count, difficulty, onDone }: { count: number; difficulty: Difficulty; onDone: () => void }) {
  const t = useTheme();
  const [problems, setProblems] = useState(() => generateProblems(count, difficulty));
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [wrong, setWrong] = useState(0);
  const shake = useRef(new Animated.Value(0)).current;
  const p = problems[index];

  const doShake = () =>
    Animated.sequence(
      [10, -10, 7, -7, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 50, useNativeDriver: true })),
    ).start();

  const submit = () => {
    if (!input) return;
    if (checkAnswer(p, input)) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setInput('');
      setWrong(0);
      if (index + 1 >= problems.length) onDone();
      else setIndex(index + 1);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      doShake();
      setInput('');
      const w = wrong + 1;
      setWrong(w);
      // After 3 misses swap the problem so nobody gets stuck half-asleep.
      if (w >= 3) {
        const [fresh] = generateProblems(1, difficulty);
        setProblems((ps) => ps.map((x, i) => (i === index ? fresh : x)));
        setWrong(0);
      }
    }
  };

  const press = (k: string) => {
    void Haptics.selectionAsync().catch(() => {});
    if (k === '⌫') setInput((v) => v.slice(0, -1));
    else if (k === '−') setInput((v) => (v.startsWith('-') ? v.slice(1) : `-${v}`));
    else setInput((v) => (v.replace('-', '').length >= 6 ? v : v + k));
  };

  const dots = useMemo(() => problems.map((_, i) => i), [problems]);

  return (
    <View style={{ gap: space.lg, width: '100%' }}>
      <Row gap={6} style={{ justifyContent: 'center' }}>
        {dots.map((i) => (
          <View
            key={i}
            style={{
              width: i === index ? 22 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: i < index ? t.accent : i === index ? t.primary : t.surfaceAlt,
            }}
          />
        ))}
      </Row>
      <Text variant="caption" muted center accessibilityLiveRegion="polite">
        Příklad {index + 1} z {problems.length}
      </Text>
      <Animated.View style={{ transform: [{ translateX: shake }], alignItems: 'center', gap: space.sm }}>
        <Text style={{ fontSize: 40, fontWeight: '300', letterSpacing: -0.5 }} accessibilityLabel={`Příklad ${p.text.replace('×', 'krát').replace('÷', 'děleno')}`}>
          {p.text} =
        </Text>
        <View
          style={{
            minWidth: 160,
            minHeight: 64,
            borderRadius: radius.lg,
            backgroundColor: t.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: space.lg,
            borderWidth: 2,
            borderColor: wrong ? t.danger : 'transparent',
          }}
        >
          <Text style={{ fontSize: 36, fontWeight: '500', fontVariant: ['tabular-nums'] }} accessibilityLabel={`Odpověď ${input || 'prázdná'}`}>
            {input || ' '}
          </Text>
        </View>
      </Animated.View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm }}>
        {KEYS.map((k) => (
          <PressableScale
            key={k}
            haptic={false}
            onPress={() => press(k)}
            accessibilityLabel={k === '⌫' ? 'Smazat' : k === '−' ? 'Záporné znaménko' : k}
            style={{
              width: 92,
              height: 60,
              borderRadius: radius.md,
              backgroundColor: t.surface,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: t.border,
            }}
          >
            <Text style={{ fontSize: 26, fontWeight: '500' }}>{k}</Text>
          </PressableScale>
        ))}
      </View>
      <PressableScale
        onPress={submit}
        accessibilityLabel="Potvrdit odpověď"
        style={{ height: 60, borderRadius: radius.pill, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text variant="bodyStrong" color={t.primaryText}>
          Potvrdit
        </Text>
      </PressableScale>
    </View>
  );
}
