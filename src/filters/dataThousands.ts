import type { App } from 'vue';
import { THOUSANDS_REGULAR, NUMBER } from '@/utils/constant';

export function dataThousands(value?: string | number | null) { // 数字从右至左添加千分符,逗号隔断,负数、小数、0、不可使用
    if (value === null || typeof value === 'undefined')
        return '';
    const amountArr = String(value).split('.');
    const integerPart = amountArr[0] ?? '';
    if (NUMBER.test(integerPart)) {
        return amountArr.length > 1
            ? `${String(integerPart).replace(THOUSANDS_REGULAR, ',')}.${amountArr[1] ?? ''}`
            : String(integerPart).replace(THOUSANDS_REGULAR, ',');
    }
    return value;
}

export default {
    install: (app: App): void => {
        const { $filters: filters } = app.config.globalProperties;
        if (process.env.NODE_ENV === 'development')
            console.warn(
                '过滤器在当前版本已不受支持，查看迁移指南：',
                'https://v3.vuejs.org/guide/migration/filters.html#migration-strategy',
            );
        app.config.globalProperties.$filters = Object.assign(Object.create(null), filters, {
            dataThousands,
        });
    },
};
