import { dataThousands } from '@/filters/dataThousands';

/**
 * 格式化展示数值，统一处理 number / string / null / undefined。
 * - null / undefined 返回 '--'
 * - number 直接格式化千分位
 * - 含逗号的字符串先剥离逗号再格式化
 * - 无法解析的字符串原样返回
 */
export function formatDisplay(
    value: string | number | null | undefined,
    fractionDigits = 2,
): string {
    if (value === null || typeof value === 'undefined') return '--';
    if (typeof value === 'number') return <string>dataThousands(value.toFixed(fractionDigits));
    const parsed = Number(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return <string>dataThousands(parsed.toFixed(fractionDigits));
    return value;
}
