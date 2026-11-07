import { useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Polygon, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { fonts } from '@/lib/theme';

/**
 * "View from your seat": a simple perspective sketch. The screen gets smaller
 * the further back the row is, shifts sideways for off-centre seats, and the
 * heads of the rows in front fill the bottom.
 */
export function SeatView({ rowIndex, rowCount, offset, title }: {
  rowIndex: number; // 0 = front row
  rowCount: number;
  offset: number; // -1 (far left) .. 1 (far right)
  title: string;
}) {
  const { width: winW } = useWindowDimensions();
  const w = winW - 64;
  const h = Math.round(w * 0.5);
  const depth = rowCount > 1 ? rowIndex / (rowCount - 1) : 0.5; // 0 near .. 1 far
  const sw = w * (0.95 - depth * 0.45); // screen width
  const sh = sw * 0.42;
  const cx = w / 2 - offset * w * 0.18;
  const top = h * 0.1;
  const skew = offset * sw * 0.06;
  const screen = [
    [cx - sw / 2 + skew, top],
    [cx + sw / 2 + skew, top + Math.abs(skew) * 0.3],
    [cx + sw / 2 - skew, top + sh],
    [cx - sw / 2 - skew, top + sh - Math.abs(skew) * 0.3],
  ].map((p) => p.join(',')).join(' ');

  const headRows = Math.min(4, rowIndex);
  const heads: React.ReactNode[] = [];
  for (let r = 0; r < headRows; r++) {
    const y = h - 6 - r * (h * 0.09);
    const rad = 13 - r * 2.2;
    for (let x = -rad + ((r % 2) * rad); x < w + rad; x += rad * 2.3) {
      heads.push(<Circle key={`${r}-${x}`} cx={x} cy={y} r={rad} fill="#05060F" opacity={0.92 - r * 0.12} />);
    }
  }

  return (
    <View style={{ borderRadius: 12, overflow: 'hidden' }}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id="hall" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1B1E3D" />
            <Stop offset="1" stopColor="#0A0B18" />
          </LinearGradient>
          <LinearGradient id="scr" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#E2572B" />
            <Stop offset="1" stopColor="#6A2414" />
          </LinearGradient>
        </Defs>
        <Rect width={w} height={h} fill="url(#hall)" />
        <Polygon points={screen} fill="url(#scr)" />
        <SvgText x={cx - sw / 2 + 10} y={top + sh * 0.45} fill="#FFFFFF" fontSize={Math.max(10, sw * 0.07)} fontFamily={fonts.display}>
          {title.toUpperCase()}
        </SvgText>
        {heads}
      </Svg>
    </View>
  );
}
