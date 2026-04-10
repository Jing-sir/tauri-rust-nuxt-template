/**
 * Small utilities used by Depth Chart hooks.
 *
 * Keep this file pure:
 * - No Vue refs/computed
 * - No side effects except reading CSS vars (browser only)
 */
export const formatNumber = (value: number, fractionDigits = 0) =>
    new Intl.NumberFormat(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(value);

/**
 * Format number with optional unit suffix.
 * Example: `withUnit(1234.5, 2, 'USDT') -> "1,234.50 USDT"`
 */
export const withUnit = (value: number, fractionDigits: number, unit: string) => {
    const formatted = formatNumber(value, fractionDigits);
    return unit ? `${formatted} ${unit}` : formatted;
};

/**
 * Convert a color to rgba with a given alpha.
 * Supports:
 * - hex (#RGB / #RRGGBB)
 * - rgb(...)
 * - rgba(...)
 */
export const toRgba = (color: string, alpha: number) => {
    if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        const normalized =
            hex.length === 3
                ? hex
                    .split('')
                    .map((ch) => ch + ch)
                    .join('')
                : hex;
        const bigint = Number.parseInt(normalized, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    if (color.startsWith('rgb(')) {
        return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }

    if (color.startsWith('rgba(')) {
        return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)/, `rgba($1,$2,$3,${alpha})`);
    }

    return color;
};

/**
 * Resolve `var(--token)` colors in browser, fallback on SSR.
 */
export const resolveCssVarColor = (color: string | undefined, fallback: string) => {
    if (!color) return fallback;
    if (!color.startsWith('var(')) return color;
    if (typeof window === 'undefined') return fallback;

    const variableName = color.replace(/var\(|\)/g, '');
    return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim() || fallback;
};

/**
 * Basic exponential smoothing for "stable-ish" transitions.
 * Used for series depth and yMax smoothing.
 */
export const smoothValue = (prev: number | null, next: number, alpha: number) =>
    prev === null ? next : prev + (next - prev) * alpha;

/**
 * Asymmetric smoothing:
 * - going up reacts faster (alphaUp)
 * - going down reacts slower (alphaDown)
 *
 * This keeps the depth chart from "jittering" vertically when the book fluctuates.
 */
export const smoothValueAsymmetric = (prev: number | null, next: number, alphaUp: number, alphaDown: number) => {
    if (prev === null) return next;
    const alpha = next > prev ? alphaUp : alphaDown;
    return prev + (next - prev) * alpha;
};
