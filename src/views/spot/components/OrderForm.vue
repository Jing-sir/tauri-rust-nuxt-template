<script setup lang="ts">
import { formatDisplay } from '@/utils/formatDisplay';

type OrderType = 'limit' | 'market' | 'stopLimit';
type OrderSide = 'buy' | 'sell';

const props = defineProps<{
  orderType: OrderType;
  orderSide: OrderSide;
  price: string;
  amount: string;
  total: string;
}>();

const emit = defineEmits<{
  'update:orderType': [value: OrderType];
  'update:orderSide': [value: OrderSide];
  'update:price': [value: string];
  'update:amount': [value: string];
  selectPercent: [value: number];
}>();

const { t } = useI18n();

const priceModel = computed({
    get: () => props.price,
    set: value => emit('update:price', value),
});

const amountModel = computed({
    get: () => props.amount,
    set: value => emit('update:amount', value),
});
</script>

<template>
    <div class="rounded-lg bg-white/90 shadow-sm dark:bg-slate-900/70">
        <div class="flex items-center justify-between px-2 py-2">
            <p class="text-sm font-semibold text-slate-900 dark:text-white">
                {{ t('下单面板') }}
            </p>
            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <button
                    type="button"
                    class="rounded-md px-2 py-1"
                    :class="props.orderType === 'limit' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                    @click="emit('update:orderType', 'limit')"
                >
                    {{ t('限价') }}
                </button>
                <button
                    type="button"
                    class="rounded-md px-2 py-1"
                    :class="props.orderType === 'market' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                    @click="emit('update:orderType', 'market')"
                >
                    {{ t('市价') }}
                </button>
                <button
                    type="button"
                    class="rounded-md px-2 py-1"
                    :class="props.orderType === 'stopLimit' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                    @click="emit('update:orderType', 'stopLimit')"
                >
                    {{ t('止盈止损') }}
                </button>
            </div>
        </div>

        <div class="space-y-2 px-2 pb-2">
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    class="flex-1 rounded-lg px-3 py-2 text-sm font-semibold"
                    :class="props.orderSide === 'buy'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-white/80 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400'"
                    @click="emit('update:orderSide', 'buy')"
                >
                    {{ t('买入') }}
                </button>
                <button
                    type="button"
                    class="flex-1 rounded-lg px-3 py-2 text-sm font-semibold"
                    :class="props.orderSide === 'sell'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-white/80 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400'"
                    @click="emit('update:orderSide', 'sell')"
                >
                    {{ t('卖出') }}
                </button>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
                <UInput
                    v-model="priceModel"
                    :placeholder="t('价格')"
                    size="sm"
                    :disabled="props.orderType === 'market'"
                />
                <UInput
                    v-model="amountModel"
                    :placeholder="t('数量')"
                    size="sm"
                />
            </div>

            <div class="grid grid-cols-4 gap-2 text-xs">
                <button type="button" class="rounded-md bg-white/80 py-1 text-slate-500 dark:bg-slate-900/60 dark:text-slate-300" @click="emit('selectPercent', 25)">25%</button>
                <button type="button" class="rounded-md bg-white/80 py-1 text-slate-500 dark:bg-slate-900/60 dark:text-slate-300" @click="emit('selectPercent', 50)">50%</button>
                <button type="button" class="rounded-md bg-white/80 py-1 text-slate-500 dark:bg-slate-900/60 dark:text-slate-300" @click="emit('selectPercent', 75)">75%</button>
                <button type="button" class="rounded-md bg-white/80 py-1 text-slate-500 dark:bg-slate-900/60 dark:text-slate-300" @click="emit('selectPercent', 100)">100%</button>
            </div>

            <div class="flex items-center justify-between rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900/60 dark:text-slate-300">
                <span>{{ t('金额') }}</span>
                <span class="font-semibold text-slate-900 dark:text-white">
                    {{ formatDisplay(props.total, 2) }}
                </span>
            </div>

            <UButton color="primary" size="sm" class="w-full">
                {{ props.orderSide === 'buy' ? t('买入') : t('卖出') }}
            </UButton>
        </div>
    </div>
</template>
