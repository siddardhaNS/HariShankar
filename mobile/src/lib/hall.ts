import type { Seat } from '@/lib/types';

/**
 * The hall in metres. These are estimates for a single-screen hall until the
 * real measurements are taken; every number the app shows about a seat
 * (distance, viewing angle, the view itself) comes from here.
 */
export const HALL_SIZE = {
  screenWidth: 11, // m
  screenAspect: 2.0, // width / height
  screenBottom: 1.6, // above the front row's floor
  firstRow: 4.5, // screen to the front row
  rowPitch: 1.0, // between rows
  seatPitch: 0.55, // between seats in a row (one map column)
  rake: 0.18, // each row is this much higher than the one in front
  eye: 1.15, // seated eye height above the floor
  sideRoom: 1.8, // wall beyond each edge of the screen
};

export type Vec3 = [number, number, number];

export type HallGeo = { minR: number; centreX: number; seats: Seat[] };

/** x right, y up, z from the screen (z = 0) towards the back of the hall */
export function hallFrom(seats: Seat[]): HallGeo {
  const cs = seats.map((s) => s.c);
  const minC = Math.min(...cs);
  const maxC = Math.max(...cs);
  return {
    minR: Math.min(...seats.map((s) => s.r)),
    centreX: ((minC + maxC) / 2) * HALL_SIZE.seatPitch,
    seats,
  };
}

export const seatX = (s: Seat) => s.c * HALL_SIZE.seatPitch;
export const rowZ = (r: number, g: HallGeo) => HALL_SIZE.firstRow + (r - g.minR) * HALL_SIZE.rowPitch;
export const rowFloor = (r: number, g: HallGeo) => (r - g.minR) * HALL_SIZE.rake;

export function eyeOf(s: Seat, g: HallGeo): Vec3 {
  return [seatX(s), rowFloor(s.r, g) + HALL_SIZE.eye, rowZ(s.r, g)];
}

export function screenRect(g: HallGeo) {
  const w = HALL_SIZE.screenWidth;
  const h = w / HALL_SIZE.screenAspect;
  const b = HALL_SIZE.screenBottom;
  return { left: g.centreX - w / 2, right: g.centreX + w / 2, bottom: b, top: b + h, centreY: b + h / 2 };
}

export type SeatLabel = 'Up close' | 'Sweet spot' | 'Full picture' | 'Side view';

export function seatMetrics(s: Seat, g: HallGeo) {
  const [x, y, z] = eyeOf(s, g);
  const scr = screenRect(g);
  // Angle the screen fills, edge to edge, at the height of its centre
  const a = [scr.left - x, scr.centreY - y, -z];
  const b = [scr.right - x, scr.centreY - y, -z];
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const fov = (Math.acos(dot / (Math.hypot(...a) * Math.hypot(...b))) * 180) / Math.PI;
  const off = x - g.centreX;
  const offCentre = Math.abs(off);
  const side = offCentre < 0.3 ? 'centre' : off < 0 ? 'left' : 'right';
  const label: SeatLabel =
    offCentre > HALL_SIZE.screenWidth * 0.3 ? 'Side view' : fov > 70 ? 'Up close' : fov >= 40 ? 'Sweet spot' : 'Full picture';
  return { toScreen: z, fov, offCentre, side, label } as const;
}
