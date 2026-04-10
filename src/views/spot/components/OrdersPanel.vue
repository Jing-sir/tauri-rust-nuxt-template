<script setup lang="ts">
import type { AssetItem, OrderItem, TradeHistoryItem } from '~~/types/spotTypes';
import { formatDisplay } from '@/utils/formatDisplay';

type OrdersTab = 'open' | 'orderHistory' | 'tradeHistory' | 'assets';

const props = defineProps<{
  activeTab: OrdersTab;
  openOrders: OrderItem[];
  orderHistory: OrderItem[];
  tradeHistory: TradeHistoryItem[];
  assets: AssetItem[];
}>();

const emit = defineEmits<{
  'update:activeTab': [value: OrdersTab];
}>();

const { t } = useI18n();
</script>

<template>
    <div class="rounded-lg bg-white/90 shadow-sm dark:bg-slate-900/70">
        <div class="flex flex-wrap items-center gap-2 px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
            <button
                type="button"
                class="rounded-md px-2 py-1"
                :class="props.activeTab === 'open' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                @click="emit('update:activeTab', 'open')"
            >
                {{ t('当前委托') }}
            </button>
            <button
                type="button"
                class="rounded-md px-2 py-1"
                :class="props.activeTab === 'orderHistory' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                @click="emit('update:activeTab', 'orderHistory')"
            >
                {{ t('历史委托') }}
            </button>
            <button
                type="button"
                class="rounded-md px-2 py-1"
                :class="props.activeTab === 'tradeHistory' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                @click="emit('update:activeTab', 'tradeHistory')"
            >
                {{ t('成交历史') }}
            </button>
            <button
                type="button"
                class="rounded-md px-2 py-1"
                :class="props.activeTab === 'assets' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                @click="emit('update:activeTab', 'assets')"
            >
                {{ t('资产信息') }}
            </button>
        </div>

        <div class="px-2 pb-2 text-xs">
            <div v-if="props.activeTab === 'open'" class="space-y-2">
                <div class="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{{ t('交易对') }}</span>
                    <span>{{ t('价格') }}</span>
                    <span>{{ t('数量') }}</span>
                    <span>{{ t('已成交') }}</span>
                </div>
                <div
                    v-for="order in props.openOrders"
                    :key="order.id"
                    class="flex items-center justify-between rounded-md bg-white/80 px-2 py-1 dark:bg-slate-900/60"
                >
                    <span class="text-slate-600 dark:text-slate-300">{{ order.pair }}</span>
                    <span class="text-slate-600 dark:text-slate-300">{{ formatDisplay(order.price, 2) }}</span>
                    <span class="text-slate-600 dark:text-slate-300">{{ formatDisplay(order.amount, 3) }}</span>
                    <span class="text-slate-400">{{ order.filled }}</span>
                </div>
            </div>

            <div v-else-if="props.activeTab === 'orderHistory'" class="space-y-2">
                <div class="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{{ t('交易对') }}</span>
                    <span>{{ t('价格') }}</span>
                    <span>{{ t('数量') }}</span>
                    <span>{{ t('已成交') }}</span>
                </div>
                <div
                    v-for="order in props.orderHistory"
                    :key="order.id"
                    class="flex items-center justify-between rounded-md bg-white/80 px-2 py-1 dark:bg-slate-900/60"
                >
                    <span class="text-slate-600 dark:text-slate-300">{{ order.pair }}</span>
                    <span class="text-slate-600 dark:text-slate-300">{{ formatDisplay(order.price, 2) }}</span>
                    <span class="text-slate-600 dark:text-slate-300">{{ formatDisplay(order.amount, 3) }}</span>
                    <span class="text-slate-400">{{ order.filled }}</span>
                </div>
            </div>

            <div v-else-if="props.activeTab === 'tradeHistory'" class="space-y-2">
                <div class="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{{ t('交易对') }}</span>
                    <span>{{ t('价格') }}</span>
                    <span>{{ t('数量') }}</span>
                    <span>{{ t('时间') }}</span>
                </div>
                <div
                    v-for="trade in props.tradeHistory"
                    :key="trade.id"
                    class="flex items-center justify-between rounded-md bg-white/80 px-2 py-1 dark:bg-slate-900/60"
                >
                    <span class="text-slate-600 dark:text-slate-300">{{ trade.pair }}</span>
                    <span class="text-slate-600 dark:text-slate-300">{{ formatDisplay(trade.price, 2) }}</span>
                    <span class="text-slate-600 dark:text-slate-300">{{ formatDisplay(trade.amount, 3) }}</span>
                    <span class="text-slate-400">{{ trade.time }}</span>
                </div>
            </div>

            <div v-else class="space-y-2">
                <div class="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{{ t('资产信息') }}</span>
                    <span>{{ t('可用') }}</span>
                    <span>{{ t('总计') }}</span>
                </div>
                <div
                    v-for="asset in props.assets"
                    :key="asset.asset"
                    class="flex items-center justify-between rounded-md bg-white/80 px-2 py-1 dark:bg-slate-900/60"
                >
                    <span class="text-slate-600 dark:text-slate-300">{{ asset.asset }}</span>
                    <span class="text-slate-600 dark:text-slate-300">{{ formatDisplay(asset.available, 2) }}</span>
                    <span class="text-slate-400">{{ formatDisplay(asset.total ?? asset.available, 2) }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
