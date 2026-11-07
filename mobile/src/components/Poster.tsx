import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { fonts } from '@/lib/theme';
import type { Movie } from '@/lib/types';

// Each movie gets a stable warm colour pair until real posters are uploaded.
const PALETTES = [
  ['#E2572B', '#5A1F12'],
  ['#2F6B8F', '#11263A'],
  ['#7A3E9D', '#24123A'],
  ['#2E8A5E', '#0F2E22'],
  ['#C2862B', '#4A2C0B'],
];

function paletteFor(title: string) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

export function Poster({ movie, width, radius = 10 }: { movie: Movie; width: number; radius?: number }) {
  const height = Math.round(width * 1.42);
  if (movie.poster_url) {
    return <Image source={movie.poster_url} style={{ width, height, borderRadius: radius }} contentFit="cover" />;
  }
  const [a, b] = paletteFor(movie.title);
  const id = `g${movie.id.slice(0, 8)}`;
  return (
    <View style={{ width, height, borderRadius: radius, overflow: 'hidden' }} accessibilityLabel={`${movie.title} poster`}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0.3" y2="1">
            <Stop offset="0" stopColor={a} />
            <Stop offset="1" stopColor={b} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id})`} />
        <Circle cx={width * 0.68} cy={height * 0.26} r={width * 0.2} fill="#FFFFFF" opacity={0.18} />
        <Circle cx={width * 0.68} cy={height * 0.26} r={width * 0.12} fill="#FCE9C4" />
      </Svg>
      {width >= 60 && (
        <View style={styles.cert}>
          <Text style={[styles.certText, { fontSize: Math.max(8, width * 0.07) }]}>{movie.certificate}</Text>
        </View>
      )}
      <Text
        numberOfLines={3}
        style={[styles.title, { fontSize: Math.max(9, width * 0.13), lineHeight: Math.max(10, width * 0.13), padding: width * 0.07 }]}
      >
        {movie.title.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cert: { position: 'absolute', top: 8, left: 8, backgroundColor: '#FFFFFF', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  certText: { fontFamily: fonts.bold, color: '#12152B' },
  title: { position: 'absolute', bottom: 0, left: 0, right: 0, color: '#FFFFFF', fontFamily: fonts.display },
});
