/**
 * Theme token fallbacks for runtime code (TS/JS).
 *
 * Why this exists:
 * - CSS variables in `src/assets/styles/theme.css` are the source of truth for light/dark colors.
 * - Some third-party widgets/options require a concrete color string (not `var(--x)`),
 *   or code may run on SSR where `getComputedStyle` is not available.
 * - In those cases we use these centralized fallbacks instead of scattering "#fff" etc.
 *
 * Scope:
 * - Only "black/white mode" core surfaces are defined here (page/chart/tooltip).
 * - Component-specific palettes (emerald/rose/etc) remain local to the feature.
 */

export type ThemeMode = 'light' | 'dark';

export const THEME_FALLBACKS: Record<
    ThemeMode,
    {
        pageBg: string;
        pageFg: string;
        chartBg: string;
        tooltipBg: string;
        tooltipBorder: string;
    }
> = {
    light: {
        pageBg: '#f8fafc',
        pageFg: '#0f172a',
        chartBg: '#ffffff',
        tooltipBg: 'rgba(255, 255, 255, 0.96)',
        tooltipBorder: 'rgba(148, 163, 184, 0.35)',
    },
    dark: {
        pageBg: '#020617',
        pageFg: '#e2e8f0',
        chartBg: '#0f172a',
        tooltipBg: 'rgba(15, 23, 42, 0.92)',
        tooltipBorder: 'rgba(148, 163, 184, 0.20)',
    },
};
