import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { Text } from '../../ui/components';
import { radius, space, useTheme } from '../../ui/theme';

/** No task configured: hold for 1.5 s to stop (prevents pocket/accidental dismissal). */
export function HoldChallenge({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const start = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    anim.current = Animated.timing(v, { toValue: 1, duration: 1500, useNativeDriver: false });
    anim.current.start(({ finished }) => finished && onDone());
  };
  const stop = () => {
    anim.current?.stop();
    Animated.timing(v, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };
  return (
    <View style={{ gap: space.md, width: '100%' }}>
      <Pressable
        onPressIn={start}
        onPressOut={stop}
        accessibilityRole="button"
        accessibilityLabel="Podrž pro vypnutí budíku"
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => onDone()}
        style={{ height: 72, borderRadius: radius.pill, backgroundColor: t.surfaceAlt, overflow: 'hidden', justifyContent: 'center' }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            backgroundColor: t.primary,
            width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }}
        />
        <Text variant="bodyStrong" center>
          Podrž pro vypnutí
        </Text>
      </Pressable>
    </View>
  );
}
