import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, {
  ClipPath,
  Defs,
  Ellipse,
  G,
  Image as SvgImage,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { BRAND } from '@/components/Logo';
import { eyeOf, HALL_SIZE, type HallGeo, rowFloor, rowZ, screenRect, seatX, type Vec3 } from '@/lib/hall';
import { fonts } from '@/lib/theme';
import type { Seat } from '@/lib/types';

const H_FOV = 78; // the camera's field of view, degrees across
const NEAR = 0.12;

type Cam = { eye: Vec3; r: Vec3; u: Vec3; f: Vec3; focal: number; w: number; h: number; cy: number };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * A level camera turned towards the middle of the screen. Instead of tilting
 * up (which would bend the screen and lose the rows in front), the picture is
 * shifted so the top of the screen sits near the top edge.
 */
function camera(eye: Vec3, target: Vec3, screenTop: number, w: number, h: number): Cam {
  const f = norm([target[0] - eye[0], 0, target[2] - eye[2]]);
  const u: Vec3 = [0, 1, 0];
  const r = cross(f, u);
  const focal = w / 2 / Math.tan((H_FOV * Math.PI) / 360);
  const dist = Math.hypot(target[0] - eye[0], target[2] - eye[2]);
  const cy = Math.min(h * 0.72, Math.max(h * 0.35, h * 0.06 + (focal * (screenTop - eye[1])) / dist));
  return { eye, r, u, f, focal, w, h, cy };
}

const toCam = (p: Vec3, c: Cam): Vec3 => {
  const d = sub(p, c.eye);
  return [dot(d, c.r), dot(d, c.u), dot(d, c.f)];
};

/** Cut away whatever is behind the camera, then project to the picture */
function project(poly: Vec3[], c: Cam): [number, number][] {
  const pts = poly.map((p) => toCam(p, c));
  const out: Vec3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ain = a[2] >= NEAR;
    const bin = b[2] >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a[2]) / (b[2] - a[2]);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), NEAR]);
    }
  }
  return out.map(([x, y, z]) => [c.w / 2 + (c.focal * x) / z, c.cy - (c.focal * y) / z]);
}

function path(poly: Vec3[], c: Cam) {
  const p = project(poly, c);
  if (p.length < 3) return null;
  return `M${p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
}

// A chair seen from behind: the back, rounded at the top
const BACK_W = 0.24;
const BACK_LOW = 0.25;
const BACK_TOP = 0.98;
const BACK_Z = 0.35; // behind the sitting position, towards the viewer
const BACK_SHAPE: [number, number][] = [
  [-1, 0], [-1, 0.86], [-0.88, 0.95], [-0.6, 1], [0.6, 1], [0.88, 0.95], [1, 0.86], [1, 0],
];

type Item = { depth: number; node: React.ReactNode };

function chairItems(s: Seat, g: HallGeo, c: Cam, picked: boolean, id: string): Item[] {
  const x = seatX(s);
  const fl = rowFloor(s.r, g);
  const z = rowZ(s.r, g) + BACK_Z;
  const items: Item[] = [];
  const centre = toCam([x, fl + 0.6, z], c);
  if (centre[2] < NEAR) return items;
  const depth = centre[2];

  const back = path(
    BACK_SHAPE.map(([dx, dy]) => [x + dx * BACK_W, fl + BACK_LOW + dy * (BACK_TOP - BACK_LOW), z] as Vec3),
    c,
  );
  const fill = picked ? `url(#${id}pick)` : `url(#${id}back)`;
  const nodes: React.ReactNode[] = [];

  // Someone already sits in a booked seat: their head shows above the chair
  if (s.state === 'booked') {
    const hc = toCam([x, fl + 1.22, z - 0.42], c);
    if (hc[2] > NEAR) {
      const k = c.focal / hc[2];
      nodes.push(
        <Ellipse key="h" cx={c.w / 2 + hc[0] * k} cy={c.cy - hc[1] * k} rx={0.1 * k} ry={0.125 * k} fill="#06070D" opacity={0.95} />,
      );
    }
  }
  if (back) nodes.push(<Path key="b" d={back} fill={fill} stroke="#00000055" strokeWidth={0.6} />);
  items.push({ depth, node: <G key={s.id}>{nodes}</G> });
  return items;
}

/**
 * "View from your seat": the hall drawn with a camera at the seat's eye
 * height, looking at the middle of the screen. Changing seat moves the
 * camera there instead of jumping.
 */
export const SeatView = memo(function SeatView({
  geo,
  seat,
  picked,
  poster,
  title,
  width,
  height,
  flyFrom,
  id = 'sv',
}: {
  geo: HallGeo;
  seat: Seat;
  picked: Set<string>;
  poster: string | null;
  title: string;
  width: number;
  height: number;
  flyFrom?: Vec3; // start the camera here (opening the full view)
  id?: string;
}) {
  const target = eyeOf(seat, geo);
  const [eye, setEye] = useState<Vec3>(flyFrom ?? target);
  const cur = useRef<Vec3>(flyFrom ?? target);

  useEffect(() => {
    const from = cur.current;
    const to = target;
    if (from.every((v, i) => Math.abs(v - to[i]) < 1e-3)) return;
    const ms = flyFrom ? 900 : 550;
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - (1 - t) ** 3;
      const p: Vec3 = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e, from[2] + (to[2] - from[2]) * e];
      cur.current = p;
      setEye(p);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target[0], target[1], target[2]]);

  const scr = screenRect(geo);
  const scene = useMemo(() => {
    const c = camera(eye, [geo.centreX, scr.centreY, 0], scr.top, width, height);
    const L = scr.left - HALL_SIZE.sideRoom;
    const R = scr.right + HALL_SIZE.sideRoom;
    const backZ = eye[2] + 3;
    const backFloor = ((backZ - HALL_SIZE.firstRow) / HALL_SIZE.rowPitch) * HALL_SIZE.rake;
    const ceil = scr.top + 2.5;

    const screen: Vec3[] = [[scr.left, scr.top, 0], [scr.right, scr.top, 0], [scr.right, scr.bottom, 0], [scr.left, scr.bottom, 0]];
    const pad = 0.35;
    const glow: Vec3[] = [
      [scr.left - pad, scr.top + pad, 0.01], [scr.right + pad, scr.top + pad, 0.01],
      [scr.right + pad, scr.bottom - pad, 0.01], [scr.left - pad, scr.bottom - pad, 0.01],
    ];
    const screenPts = project(screen, c);
    const xs = screenPts.map((p) => p[0]);
    const ys = screenPts.map((p) => p[1]);
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };

    // Chairs in the rows in front, drawn far to near so nearer ones cover the rest
    const chairs = geo.seats
      .filter((s) => rowZ(s.r, geo) + BACK_Z < eye[2] - 0.2)
      .flatMap((s) => chairItems(s, geo, c, picked.has(s.id), id))
      .sort((a, b) => b.depth - a.depth);

    return {
      wallL: path([[L, 0, 0], [L, ceil, 0], [L, ceil, backZ], [L, backFloor, backZ]], c),
      wallR: path([[R, 0, 0], [R, ceil, 0], [R, ceil, backZ], [R, backFloor, backZ]], c),
      front: path([[L, 0, 0], [L, ceil, 0], [R, ceil, 0], [R, 0, 0]], c),
      floor: path([[L, 0, 0], [R, 0, 0], [R, backFloor, backZ], [L, backFloor, backZ]], c),
      screen: path(screen, c),
      glow: path(glow, c),
      box,
      chairs,
    };
  }, [eye, geo, scr.centreY, scr.left, scr.right, scr.top, scr.bottom, width, height, picked, id]);

  return (
    <View style={{ width, height, borderRadius: 14, overflow: 'hidden', backgroundColor: '#05060B' }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`${id}wall`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0B0C16" />
            <Stop offset="1" stopColor="#1A1626" />
          </LinearGradient>
          <LinearGradient id={`${id}floor`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1E1720" />
            <Stop offset="1" stopColor="#07070C" />
          </LinearGradient>
          <LinearGradient id={`${id}back`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#B4232F" />
            <Stop offset="0.55" stopColor="#7A1220" />
            <Stop offset="1" stopColor="#2C060C" />
          </LinearGradient>
          <LinearGradient id={`${id}pick`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#4CC27F" />
            <Stop offset="1" stopColor="#14522E" />
          </LinearGradient>
          <LinearGradient id={`${id}scr`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#E2572B" />
            <Stop offset="1" stopColor="#6A2414" />
          </LinearGradient>
          <LinearGradient id={`${id}sheen`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.08} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.25} />
          </LinearGradient>
          <RadialGradient id={`${id}spill`} cx="50%" cy="0%" rx="60%" ry="80%">
            <Stop offset="0" stopColor="#F3D9B0" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#F3D9B0" stopOpacity={0} />
          </RadialGradient>
          {scene.screen && (
            <ClipPath key={scene.screen} id={`${id}clip`}>
              <Path d={scene.screen} />
            </ClipPath>
          )}
        </Defs>

        {scene.front && <Path d={scene.front} fill="#08090F" />}
        {scene.wallL && <Path d={scene.wallL} fill={`url(#${id}wall)`} />}
        {scene.wallR && <Path d={scene.wallR} fill={`url(#${id}wall)`} />}
        {scene.floor && <Path d={scene.floor} fill={`url(#${id}floor)`} />}
        <Rect width={width} height={height} fill={`url(#${id}spill)`} />
        {scene.glow && <Path d={scene.glow} fill="#F3D9B0" opacity={0.07} />}
        {scene.screen && (
          <G key={scene.screen} clipPath={`url(#${id}clip)`}>
            <Rect x={scene.box.x} y={scene.box.y} width={scene.box.w} height={scene.box.h} fill={`url(#${id}scr)`} />
            {poster ? (
              <SvgImage
                x={scene.box.x}
                y={scene.box.y}
                width={scene.box.w}
                height={scene.box.h}
                preserveAspectRatio="xMidYMid slice"
                href={{ uri: poster }}
              />
            ) : (
              <SvgText
                x={scene.box.x + scene.box.w * 0.06}
                y={scene.box.y + scene.box.h * 0.55}
                fill="#FFFFFF"
                fontSize={Math.max(10, scene.box.w * 0.07)}
                fontFamily={fonts.display}
              >
                {title.toUpperCase()}
              </SvgText>
            )}
            <Rect x={scene.box.x} y={scene.box.y} width={scene.box.w} height={scene.box.h} fill={`url(#${id}sheen)`} />
          </G>
        )}
        {scene.chairs.map((ch) => ch.node)}
        <Rect width={width} height={2} fill={BRAND.gold} opacity={0.6} />
      </Svg>
    </View>
  );
});

/** The whole hall as dots with one seat marked, for the corner of the seat card */
export function MiniHall({ seats, seat, width = 64, height = 44 }: { seats: Seat[]; seat: Seat; width?: number; height?: number }) {
  const rs = seats.map((s) => s.r);
  const cs = seats.map((s) => s.c);
  const minR = Math.min(...rs);
  const minC = Math.min(...cs);
  const nr = Math.max(...rs) - minR + 1;
  const nc = Math.max(...cs) - minC + 1;
  const top = 8;
  const sx = (width - 4) / nc;
  const sy = (height - top - 2) / nr;
  const d = Math.max(1, Math.min(sx, sy) * 0.55);
  return (
    <Svg width={width} height={height}>
      <Path d={`M4 4Q${width / 2} 0 ${width - 4} 4`} stroke="#C9CCDC" strokeWidth={1.2} fill="none" />
      {seats.map((s) =>
        s.id === seat.id ? null : (
          <Rect key={s.id} x={2 + (s.c - minC) * sx} y={top + (s.r - minR) * sy} width={d} height={d} fill="#5B6185" opacity={0.6} />
        ),
      )}
      <Rect
        x={2 + (seat.c - minC) * sx - d * 0.6}
        y={top + (seat.r - minR) * sy - d * 0.6}
        width={d * 2.2}
        height={d * 2.2}
        rx={d * 0.4}
        fill="#4CC27F"
      />
    </Svg>
  );
}
