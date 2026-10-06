import { createContext, useContext } from 'react';

export type Palette = {
  scheme: 'light' | 'dark';
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryText: string;
  primarySoft: string;
  accent: string; // mint
  accentSoft: string;
  warm: string; // peach
  warmSoft: string;
  sky: string;
  skySoft: string;
  danger: string;
  dangerSoft: string;
  heroFrom: string;
  heroTo: string;
  overlay: string;
};

export const dark: Palette = {
  scheme: 'dark',
  bg: '#0B1020',
  bgElevated: '#10162B',
  surface: '#151C33',
  surfaceAlt: '#1D2542',
  border: 'rgba(255,255,255,0.07)',
  text: '#F3F2FF',
  textMuted: '#A3ABC8',
  textFaint: '#6A7393',
  primary: '#A99BFF',
  primaryText: '#120E2E',
  primarySoft: 'rgba(169,155,255,0.15)',
  accent: '#8FE3C8',
  accentSoft: 'rgba(143,227,200,0.14)',
  warm: '#FFC6A8',
  warmSoft: 'rgba(255,198,168,0.14)',
  sky: '#9CC8FF',
  skySoft: 'rgba(156,200,255,0.14)',
  danger: '#FF8FA3',
  dangerSoft: 'rgba(255,143,163,0.14)',
  heroFrom: '#1A1F4D',
  heroTo: '#3B2A70',
  overlay: 'rgba(5,8,18,0.6)',
};

export const light: Palette = {
  scheme: 'light',
  bg: '#F4F3FA',
  bgElevated: '#FBFAFF',
  surface: '#FFFFFF',
  surfaceAlt: '#EEECF8',
  border: 'rgba(18,21,42,0.07)',
  text: '#12152A',
  textMuted: '#5F6684',
  textFaint: '#9AA0B8',
  primary: '#6A5AE0',
  primaryText: '#FFFFFF',
  primarySoft: '#ECE9FF',
  accent: '#239C78',
  accentSoft: '#DDF5EC',
  warm: '#D9774A',
  warmSoft: '#FFEDE3',
  sky: '#3577C9',
  skySoft: '#E3EEFC',
  danger: '#D94461',
  dangerSoft: '#FDE6EB',
  heroFrom: '#2A2F6E',
  heroTo: '#6A5AE0',
  overlay: 'rgba(18,21,42,0.35)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const type = {
  display: { fontSize: 64, fontWeight: '200' as const, letterSpacing: -2 },
  hero: { fontSize: 44, fontWeight: '300' as const, letterSpacing: -1.2 },
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.6 },
  heading: { fontSize: 19, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  overline: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 1.1, textTransform: 'uppercase' as const },
};

export const ThemeContext = createContext<Palette>(dark);

export function useTheme(): Palette {
  return useContext(ThemeContext);
}
