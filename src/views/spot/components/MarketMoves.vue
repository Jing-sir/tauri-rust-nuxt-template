<script setup lang="ts">
import { dataThousands } from '@/filters/dataThousands';

const { t } = useI18n();

type MoveItem = {
    symbol: string;
    price: string;
    change: string;
    tone: 'up' | 'down';
};

const props = withDefaults(defineProps<{
    items?: MoveItem[];
}>(), {
    items: () => [],
});

const formatDisplay = (value: string | number | null | undefined, fractionDigits = 2) => {
    if (value === null || typeof value === 'undefined') return '--';
    if (typeof value === 'number') return dataThousands(value.toFixed(fractionDigits));
    const parsed = Number(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return dataThousands(parsed.toFixed(fractionDigits));
    return value;
};

const fallbackMoves: MoveItem[] = [
    { symbol: 'BTC/USDT', price: '63,840.12', change: '+1.24%', tone: 'up' },
    { symbol: 'ETH/USDT', price: '3,488.22', change: '-0.48%', tone: 'down' },
    { symbol: 'SOL/USDT', price: '138.10', change: '+2.12%', tone: 'up' },
];

const displayRows = computed(() =>
    props.items.length > 0 ? props.items : fallbackMoves,
);
</script>

<template>
    <div class="rounded-lg bg-white/90 shadow-sm dark:bg-slate-900/70">
        <p class="px-2 py-2 text-sm font-semibold text-slate-900 dark:text-white">
            {{ t('市场异动') }}
        </p>

        <div class="space-y-2 px-2 pb-2 text-xs">
            <div class="flex items-center justify-between text-[11px] text-slate-400">
                <span>{{ t('交易对') }}</span>
                <span>{{ t('最新价') }}</span>
                <span>{{ t('24h') }}</span>
            </div>
            <div
                v-for="item in displayRows"
                :key="item.symbol"
                class="flex items-center justify-between text-slate-600 dark:text-slate-300"
            >
                <span class="font-semibold">{{ item.symbol }}</span>
                <span>{{ formatDisplay(item.price, 2) }}</span>
                <span :class="item.tone === 'up' ? 'text-emerald-500' : 'text-rose-500'">
                    {{ item.change }}
                </span>
            </div>
        </div>
    </div>
</template>
