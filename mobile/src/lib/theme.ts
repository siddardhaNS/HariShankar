import { useColorScheme } from 'react-native';

// Palette from the HariShankar mockups; dark mode follows the phone setting.
const light = {
  bg: '#F3F4FA',
  card: '#FFFFFF',
  ink: '#12152B',
  ink2: '#3A3F5C',
  muted: '#5B6185',
  line: '#E4E6EF',
  field: '#C9CCDC',
  brand: '#D7263D',
  brandSoft: '#FDE8EB',
  brandInk: '#8A1424',
  ok: '#1F8A4C',
  okSoft: '#E3F5EA',
  warnSoft: '#FFF4C2',
  warnInk: '#7A5B00',
  chip: '#EEF0F7',
  seatFree: '#FFFFFF',
  seatTaken: '#C9CCDC',
  navy: '#141631',
};

const dark: typeof light = {
  bg: '#0E1022',
  card: '#181B33',
  ink: '#F1F2F8',
  ink2: '#C9CCDC',
  muted: '#9A9FBB',
  line: '#2A2E4D',
  field: '#3A3F5C',
  brand: '#E8435A',
  brandSoft: '#3A1520',
  brandInk: '#FFB3BE',
  ok: '#4CC27F',
  okSoft: '#12301F',
  warnSoft: '#3A3010',
  warnInk: '#F5D774',
  chip: '#23264A',
  seatFree: '#181B33',
  seatTaken: '#3A3F5C',
  navy: '#0A0B1A',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const fonts = {
  regular: 'Roboto_400Regular',
  medium: 'Roboto_500Medium',
  bold: 'Roboto_700Bold',
  display: 'RobotoCondensed_700Bold',
};
