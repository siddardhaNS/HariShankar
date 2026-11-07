import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { T } from '@/components/ui';
import { fonts } from '@/lib/theme';

/*
 * The Hari Shankar mark: a theatre stage. Red curtains drawn back under a
 * scalloped valance with a gold trim, and a warm spotlight on the stage floor,
 * in a dark house. Drawn on a 100 x 100 grid; scripts/make-icons.mjs draws the
 * same shapes for the app icon.
 */
export const STAGE = {
  leftCurtain: 'M14 16h17c-2 22-1 44 3 68H14Z',
  rightCurtain: 'M86 16H69c2 22 1 44-3 68h20Z',
  folds: 'M21 26c-1 18 0 38 2 56M27 26c-1 18 0 38 2 56M79 26c1 18 0 38-2 56M73 26c1 18 0 38-2 56',
  valance: 'M14 16h72v9c-4.5 4.4-13.5 4.4-18 0-4.5 4.4-13.5 4.4-18 0-4.5 4.4-13.5 4.4-18 0-4.5 4.4-13.5 4.4-18 0Z',
  trim: 'M14 16h72',
  floor: 'M10 86h80',
};

export const BRAND = { red: '#D7263D', deep: '#9E1730', house: '#141631', gold: '#F6C453' };

/** The stage, in colour. `id` keeps gradient ids unique when several are on screen. */
export function StageScene({ id = 'hs' }: { id?: string }) {
  return (
    <>
      <Defs>
        <LinearGradient id={`${id}Curtain`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={BRAND.red} />
          <Stop offset="1" stopColor={BRAND.deep} />
        </LinearGradient>
        <RadialGradient id={`${id}Light`} cx="50" cy="84" r="34" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={BRAND.gold} stopOpacity={0.6} />
          <Stop offset="1" stopColor={BRAND.gold} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="14" y="16" width="72" height="68" fill={`url(#${id}Light)`} />
      <Path d={STAGE.leftCurtain} fill={`url(#${id}Curtain)`} />
      <Path d={STAGE.rightCurtain} fill={`url(#${id}Curtain)`} />
      <Path d={STAGE.folds} stroke={BRAND.deep} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.9} />
      <Path d={STAGE.valance} fill={BRAND.red} />
      <Path d={STAGE.trim} stroke={BRAND.gold} strokeWidth={3} />
      <Path d={STAGE.floor} stroke={BRAND.gold} strokeWidth={5} strokeLinecap="round" />
    </>
  );
}

/** App-icon style: the stage on a dark tile. */
export function LogoMark({ size = 56, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style} accessibilityRole="image" accessibilityLabel="Hari Shankar Picture Palace">
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Rect x="0" y="0" width="100" height="100" rx="24" fill={BRAND.house} />
        <StageScene id={`mark${size}`} />
      </Svg>
    </View>
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
