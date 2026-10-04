import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, type as typo, useTheme } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ------------------------------------------------------------------ text ----

type Variant = keyof typeof typo;

export function Text({
  variant = 'body',
  color,
  muted,
  faint,
  center,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string; muted?: boolean; faint?: boolean; center?: boolean }) {
  const t = useTheme();
  const c = color ?? (faint ? t.textFaint : muted ? t.textMuted : t.text);
  return (
    <RNText
      {...rest}
      style={[typo[variant] as TextStyle, { color: c }, center && { textAlign: 'center' }, style]}
    />
  );
}

// ---------------------------------------------------------------- layout ----

export function Screen({
  children,
  scroll = true,
  padded = true,
  topInset = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  topInset?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const inner: ViewStyle = {
    paddingTop: topInset ? insets.top + space.md : space.md,
    paddingBottom: insets.bottom + 110,
    paddingHorizontal: padded ? space.lg + 4 : 0,
    gap: space.lg,
  };
  if (!scroll) {
    return <View style={[{ flex: 1, backgroundColor: t.bg }, inner, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={[inner, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
  tone = 'surface',
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  tone?: 'surface' | 'alt' | 'primary' | 'accent' | 'warm' | 'danger' | 'sky';
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const bg = {
    surface: t.surface,
    alt: t.surfaceAlt,
    primary: t.primarySoft,
    accent: t.accentSoft,
    warm: t.warmSoft,
    danger: t.dangerSoft,
    sky: t.skySoft,
  }[tone];
  const base: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: tone === 'surface' ? StyleSheet.hairlineWidth : 0,
    borderColor: t.border,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <PressableScale onPress={onPress} style={[base, style]} accessibilityLabel={accessibilityLabel}>
      {children}
    </PressableScale>
  );
}

export function Row({
  children,
  gap = space.md,
  style,
  align = 'center',
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  align?: ViewStyle['alignItems'];
}) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

export function Spacer({ size = space.md }: { size?: number }) {
  return <View style={{ height: size }} />;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm, paddingHorizontal: 2 }}>
      <Text variant="overline" muted>
        {title}
      </Text>
      {action}
    </Row>
  );
}

// ------------------------------------------------------------ pressables ----

export function PressableScale({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
  haptic = true,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: ComponentProps<typeof Pressable>['accessibilityRole'];
  accessibilityState?: ComponentProps<typeof Pressable>['accessibilityState'];
  haptic?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      onPress={() => {
        if (haptic) void Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      onLongPress={onLongPress}
      onPressIn={() => animate(0.97)}
      onPressOut={() => animate(1)}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
    >
      <Animated.View style={[style, { transform: [{ scale }], opacity: disabled ? 0.45 : 1 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  size = 'lg',
  style,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const bg = { primary: t.primary, secondary: t.surfaceAlt, ghost: 'transparent', danger: t.dangerSoft }[kind];
  const fg = { primary: t.primaryText, secondary: t.text, ghost: t.primary, danger: t.danger }[kind];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          minHeight: size === 'lg' ? 56 : 44,
          paddingHorizontal: size === 'lg' ? space.xl : space.lg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'lg' ? 20 : 18} color={fg} />}
          <Text variant="bodyStrong" color={fg}>
            {title}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  tone = 'alt',
  size = 44,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  tone?: 'alt' | 'primary' | 'plain';
  size?: number;
}) {
  const t = useTheme();
  const bg = tone === 'primary' ? t.primary : tone === 'alt' ? t.surfaceAlt : 'transparent';
  const fg = tone === 'primary' ? t.primaryText : t.text;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={size * 0.48} color={fg} />
    </PressableScale>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        minHeight: 38,
        borderRadius: radius.pill,
        backgroundColor: selected ? t.primary : t.surfaceAlt,
      }}
    >
      {icon && <Ionicons name={icon} size={16} color={selected ? t.primaryText : t.textMuted} />}
      <Text variant="caption" color={selected ? t.primaryText : t.text}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: t.surfaceAlt, borderRadius: radius.pill, padding: 4 }}
    >
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={o.label}
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: sel ? t.surface : 'transparent',
            }}
          >
            <Text variant="caption" color={sel ? t.text : t.textMuted}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={(v) => {
        void Haptics.selectionAsync().catch(() => {});
        onChange(v);
      }}
      accessibilityLabel={label}
      trackColor={{ false: t.surfaceAlt, true: t.primary }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={t.surfaceAlt}
    />
  );
}

export function ListRow({
  icon,
  iconTone = 'primary',
  title,
  subtitle,
  right,
  onPress,
  chevron = !!onPress,
}: {
  icon?: IconName;
  iconTone?: 'primary' | 'accent' | 'warm' | 'sky' | 'danger';
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const t = useTheme();
  const tones = {
    primary: [t.primarySoft, t.primary],
    accent: [t.accentSoft, t.accent],
    warm: [t.warmSoft, t.warm],
    sky: [t.skySoft, t.sky],
    danger: [t.dangerSoft, t.danger],
  }[iconTone];
  const content = (
    <Row style={{ minHeight: 52, paddingVertical: 6 }}>
      {icon && (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: tones[0],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={19} color={tones[1]} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" muted numberOfLines={2} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron && <Ionicons name="chevron-forward" size={18} color={t.textFaint} />}
    </Row>
  );
  if (!onPress) return content;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}>
      {content}
    </PressableScale>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 2 }} />;
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, gap: space.md }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: t.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={32} color={t.primary} />
      </View>
      <Text variant="heading" center>
        {title}
      </Text>
      <Text muted center style={{ maxWidth: 300 }}>
        {text}
      </Text>
      {action}
    </View>
  );
}

export function Notice({
  tone = 'warm',
  icon = 'information-circle',
  title,
  text,
  action,
}: {
  tone?: 'warm' | 'danger' | 'primary' | 'accent' | 'sky';
  icon?: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  const fg = { warm: t.warm, danger: t.danger, primary: t.primary, accent: t.accent, sky: t.sky }[tone];
  return (
    <Card tone={tone}>
      <Row align="flex-start">
        <Ionicons name={icon} size={22} color={fg} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodyStrong">{title}</Text>
          {text ? <Text variant="caption" muted>{text}</Text> : null}
          {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
        </View>
      </Row>
    </Card>
  );
}

/** Fades + slides children in on mount (subtle, 250 ms). */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 280, delay, useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v: number) => String(v),
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  label: string;
}) {
  return (
    <Row gap={space.sm} style={{ alignSelf: 'flex-start' }}>
      <IconButton
        icon="remove"
        size={36}
        label={`${label}: méně`}
        onPress={() => onChange(Math.max(min, value - step))}
      />
      <Text
        variant="bodyStrong"
        style={{ minWidth: 64, textAlign: 'center' }}
        accessibilityLabel={`${label}: ${format(value)}`}
      >
        {format(value)}
      </Text>
      <IconButton
        icon="add"
        size={36}
        label={`${label}: více`}
        onPress={() => onChange(Math.min(max, value + step))}
      />
    </Row>
  );
}
