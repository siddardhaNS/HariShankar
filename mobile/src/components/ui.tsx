import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { fonts, useColors } from '@/lib/theme';

type Variant = 'body' | 'small' | 'label' | 'title' | 'display' | 'eyebrow' | 'mono';

export function T({ v = 'body', style, children, ...rest }: TextProps & { v?: Variant; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  const base: Record<Variant, TextStyle> = {
    body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: c.ink },
    small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: c.muted },
    label: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: c.ink },
    title: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 24, color: c.ink },
    display: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: c.ink, textTransform: 'uppercase' },
    eyebrow: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, color: c.muted, textTransform: 'uppercase' },
    mono: { fontFamily: 'monospace', fontSize: 14, color: c.ink, fontWeight: '700' },
  };
  return (
    <Text {...rest} style={[base[v], style]}>
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = kind === 'primary' ? c.brand : kind === 'secondary' ? c.card : 'transparent';
  const fg = kind === 'primary' ? '#FFFFFF' : kind === 'ghost' ? c.brand : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        kind === 'secondary' && { borderWidth: 1, borderColor: c.field },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const content = (
    <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: selected ? c.brandInk : c.ink2 }}>{label}</Text>
  );
  const chipStyle = [
    styles.chip,
    { backgroundColor: selected ? c.brandSoft : c.chip, borderColor: selected ? c.brand : 'transparent' },
    style,
  ];
  if (!onPress) return <View style={chipStyle}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={chipStyle}>
      {content}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }, style]}>{children}</View>;
}

export function BackIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M20 12H5m6-7-7 7 7 7" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/** Screen header from the mockups: back arrow, big condensed title, subtitle. */
export function Header({ title, subtitle, onBack, right }: {
  title: string;
  subtitle?: string;
  onBack?: (() => void) | false;
  right?: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: c.card, borderBottomColor: c.line }]}>
      {onBack !== false && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
          style={{ marginRight: 14, marginTop: 4 }}
        >
          <BackIcon color={c.ink} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <T v="display" numberOfLines={1}>{title}</T>
        {subtitle ? <T v="small" numberOfLines={1} style={{ marginTop: 2 }}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

export function Banner({ kind, title, children }: { kind: 'info' | 'ok' | 'error'; title?: string; children?: ReactNode }) {
  const c = useColors();
  const bg = kind === 'ok' ? c.okSoft : kind === 'error' ? c.brandSoft : c.brandSoft;
  const fg = kind === 'ok' ? c.ok : c.brandInk;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      {title ? <T v="label" style={{ color: kind === 'ok' ? c.ok : c.ink }}>{title}</T> : null}
      {typeof children === 'string' ? <T v="small" style={{ color: fg, marginTop: title ? 3 : 0 }}>{children}</T> : children}
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator color={c.brand} size="large" />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: c.bg }}>
      <T v="title" style={{ textAlign: 'center' }}>Couldn&apos;t load this</T>
      <T v="small" style={{ textAlign: 'center', marginTop: 6 }}>{message}</T>
      {onRetry && <Button title="Try again" kind="secondary" onPress={onRetry} style={{ marginTop: 18, minWidth: 160 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 50, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.bold, fontSize: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  banner: { borderRadius: 14, padding: 14 },
});
