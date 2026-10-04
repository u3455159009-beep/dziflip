import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { pad2, weekdayShort } from '../domain/schedule';
import type { IsoWeekday } from '../domain/types';
import { PressableScale, Text } from './components';
import { radius, space, useTheme } from './theme';

// ---------------------------------------------------------------- slider ----

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const startRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const clamp = (v: number) => {
    const stepped = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, Number(stepped.toFixed(6))));
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const x = e.nativeEvent.locationX;
          const v = clamp(min + (x / widthRef.current) * (max - min));
          startRef.current = v;
          onChangeRef.current(v);
        },
        onPanResponderMove: (_e, g) => {
          const v = clamp(startRef.current + (g.dx / widthRef.current) * (max - min));
          if (v !== valueRef.current) onChangeRef.current(v);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [min, max, step],
  );

  const frac = (value - min) / (max - min || 1);
  const text = format ? format(value) : String(value);
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => {
        widthRef.current = Math.max(1, e.nativeEvent.layout.width);
        setWidth(widthRef.current);
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const big = (max - min) / 10;
        if (e.nativeEvent.actionName === 'increment') onChange(clamp(value + Math.max(step, big)));
        if (e.nativeEvent.actionName === 'decrement') onChange(clamp(value - Math.max(step, big)));
      }}
      style={{ height: 40, justifyContent: 'center' }}
      {...responder.panHandlers}
    >
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt }} pointerEvents="none">
        <View style={{ width: frac * width, height: 6, borderRadius: 3, backgroundColor: t.primary }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: Math.max(0, Math.min(width - 26, frac * width - 13)),
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: '#FFFFFF',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        }}
      />
    </View>
  );
}

// ------------------------------------------------------------ time wheel ----

const ITEM_H = 56;
const VISIBLE = 3;
const REPEAT = 41; // odd → centre copy; long enough to feel infinite

function Wheel({
  count,
  value,
  onChange,
  label,
  format = pad2,
}: {
  count: number;
  value: number;
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const ref = useRef<ScrollView>(null);
  const mid = Math.floor(REPEAT / 2) * count;
  const [live, setLive] = useState(value);
  const lastHaptic = useRef(value);
  const items = useMemo(() => Array.from({ length: count * REPEAT }, (_, i) => i % count), [count]);

  useEffect(() => {
    setLive(value);
    ref.current?.scrollTo({ y: (mid + value) * ITEM_H, animated: false });
  }, [value, mid]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const v = ((idx % count) + count) % count;
    // Re-centre silently so the wheel never runs out.
    ref.current?.scrollTo({ y: (mid + v) * ITEM_H, animated: false });
    if (v !== value) onChange(v);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange((value + 1) % count);
        if (e.nativeEvent.actionName === 'decrement') onChange((value - 1 + count) % count);
      }}
      style={{ height: ITEM_H * VISIBLE, width: 104, overflow: 'hidden' }}
    >
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_H * ((VISIBLE - 1) / 2) }}
        contentOffset={{ x: 0, y: (mid + value) * ITEM_H }}
        onScroll={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          const v = ((idx % count) + count) % count;
          if (v !== lastHaptic.current) {
            lastHaptic.current = v;
            setLive(v);
            void Haptics.selectionAsync().catch(() => {});
          }
        }}
        scrollEventThrottle={32}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(e) => {
          // Android delivers no momentum event for slow drags.
          if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle(e);
        }}
      >
        {items.map((v, i) => (
          <View key={i} style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
            <Text
              style={{
                fontSize: 46,
                fontWeight: v === live ? '300' : '200',
                letterSpacing: -1,
                fontVariant: ['tabular-nums'],
                color: v === live ? t.text : t.textFaint,
              }}
            >
              {format(v)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function TimeWheel({
  hour,
  minute,
  onChange,
}: {
  hour: number;
  minute: number;
  onChange: (h: number, m: number) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: ITEM_H,
          borderRadius: radius.md,
          backgroundColor: t.primarySoft,
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Wheel count={24} value={hour} onChange={(h) => onChange(h, minute)} label="Hodiny" />
        <Text style={{ fontSize: 40, fontWeight: '200', marginHorizontal: space.xs }}>:</Text>
        <Wheel count={60} value={minute} onChange={(m) => onChange(hour, m)} label="Minuty" />
      </View>
    </View>
  );
}

// -------------------------------------------------------- weekday picker ----

const ORDER: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export function WeekdayPicker({
  value,
  onChange,
}: {
  value: IsoWeekday[];
  onChange: (v: IsoWeekday[]) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {ORDER.map((d) => {
        const sel = value.includes(d);
        return (
          <PressableScale
            key={d}
            onPress={() => onChange(sel ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sel }}
            accessibilityLabel={weekdayShort(d)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: sel ? t.primary : t.surfaceAlt,
            }}
          >
            <Text variant="caption" color={sel ? t.primaryText : t.textMuted}>
              {weekdayShort(d)}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
