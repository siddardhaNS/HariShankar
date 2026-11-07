import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { T } from '@/components/ui';
import { fonts } from '@/lib/theme';

/*
 * The Hari Shankar mark: a theatre arch (the palace, and the curve of the
 * screen) over a stage, with a play button in the middle. Drawn on a 100 x 100
 * grid; scripts/make-icons.mjs draws the same shapes for the app icon.
 */
export const MARK = {
  arch: 'M22 66V46a28 22 0 0 1 56 0v20', // stroke 7, round caps
  play: 'M44.5 39v22l18-11Z',             // fill + stroke 4, round joins (soft corners)
  stage: 'M15 76h70',                     // stroke 6, round caps
};

function Glyph({ color }: { color: string }) {
  return (
    <>
      <Path d={MARK.arch} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" />
      <Path d={MARK.play} fill={color} stroke={color} strokeWidth={4} strokeLinejoin="round" />
      <Path d={MARK.stage} stroke={color} strokeWidth={6} strokeLinecap="round" />
    </>
  );
}

export const BRAND = { red: '#D7263D', deep: '#9E1730' };

/** App-icon style: white arch on a red tile. */
export function LogoMark({ size = 56, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style} accessibilityRole="image" accessibilityLabel="Hari Shankar Picture Palace">
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="hsTile" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BRAND.red} />
            <Stop offset="1" stopColor={BRAND.deep} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" rx="24" fill="url(#hsTile)" />
        <Glyph color="#FFFFFF" />
      </Svg>
    </View>
  );
}

/** Just the mark, for placing on a coloured background (login hero, splash). */
export function LogoGlyph({ size = 56, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Hari Shankar Picture Palace">
      <Glyph color={color} />
    </Svg>
  );
}

/** HARI SHANKAR / PICTURE PALACE · PALASA */
export function Wordmark({ color, sub, size = 22, align = 'left' }: {
  color: string;
  sub?: string;
  size?: number;
  align?: 'left' | 'center';
}) {
  return (
    <View style={{ alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      <T style={{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.02, letterSpacing: size * 0.04, color }}>
        HARI SHANKAR
      </T>
      <T style={{ fontFamily: fonts.medium, fontSize: size * 0.42, lineHeight: size * 0.6, letterSpacing: size * 0.12, color, opacity: 0.8, marginTop: 2 }}>
        {sub ?? 'PICTURE PALACE · PALASA'}
      </T>
    </View>
  );
}
