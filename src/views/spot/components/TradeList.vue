<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type { TradeItem } from '~~/types/spotTypes';
import { formatDisplay } from '@/utils/formatDisplay';

const props = defineProps<{
  latestTrades: TradeItem[];
  myTrades: TradeItem[];
}>();

const { t } = useI18n();

const activeTab = shallowRef<'latest' | 'mine'>('latest');
const currentTrades = computed(() => (activeTab.value === 'latest' ? props.latestTrades : props.myTrades));
</script>

<template>
    <div class="flex h-[320px] min-h-[300px] flex-col rounded-lg bg-white/90 shadow-sm dark:bg-slate-900/70">
        <div class="flex items-center gap-2 px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
            <button
                type="button"
                class="rounded-md px-2 py-1"
                :class="activeTab === 'latest' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                @click="activeTab = 'latest'"
            >
                {{ t('最新成交') }}
            </button>
            <button
                type="button"
                class="rounded-md px-2 py-1"
                :class="activeTab === 'mine' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                @click="activeTab = 'mine'"
            >
                {{ t('我的成交') }}
            </button>
        </div>

        <div class="flex-1 min-h-0 px-2 pb-2 text-xs">
            <div class="flex h-full min-h-0 flex-col">
                <div class="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{{ t('价格') }}</span>
                    <span>{{ t('数量') }}</span>
                    <span>{{ t('时间') }}</span>
                </div>

                <div class="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
                    <div
                        v-for="trade in currentTrades"
                        :key="trade.id ?? `${trade.time}-${trade.price}-${trade.amount}`"
                        class="flex items-center justify-between text-slate-600 dark:text-slate-300"
                    >
                        <span :class="trade.side === 'buy' ? 'text-emerald-500' : 'text-rose-500'">
                            {{ formatDisplay(trade.price, 2) }}
                        </span>
                        <span class="text-right">{{ formatDisplay(trade.amount, 3) }}</span>
                        <span class="text-right text-slate-400">{{ trade.time }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
