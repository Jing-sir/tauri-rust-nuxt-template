<script setup lang="ts">
import type { PairItem } from '~~/types/spotTypes';
import { formatDisplay } from '@/utils/formatDisplay';

const props = defineProps<{
  pair?: PairItem;
}>();

const { t } = useI18n();
</script>

<template>
    <section class="rounded-lg bg-white/85 shadow-sm dark:bg-slate-900/70">
        <div class="flex flex-wrap items-center gap-4 px-3 py-2">
            <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {{ t('交易对') }}
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                    {{ props.pair?.symbol ?? '--' }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ props.pair?.base ?? '--' }} / {{ props.pair?.quote ?? '--' }}
                </p>
            </div>

            <div class="flex flex-wrap items-center gap-6 text-sm">
                <div>
                    <p class="text-[11px] uppercase tracking-wide text-slate-400">
                        {{ t('最新价') }}
                    </p>
                    <p class="text-lg font-semibold text-slate-900 dark:text-white">
                        {{ formatDisplay(props.pair?.price, 2) }}
                    </p>
                </div>
                <div>
                    <p class="text-[11px] uppercase tracking-wide text-slate-400">
                        {{ t('24h 涨跌') }}
                    </p>
                    <p :class="props.pair?.tone === 'up' ? 'text-emerald-500' : 'text-rose-500'">
                        {{ props.pair?.change ?? '--' }}
                    </p>
                </div>
                <div>
                    <p class="text-[11px] uppercase tracking-wide text-slate-400">
                        {{ t('24h 成交量') }}
                    </p>
                    <p class="text-slate-600 dark:text-slate-300">
                        {{ formatDisplay(props.pair?.volume, 2) }}
                    </p>
                </div>
            </div>
        </div>
    </section>
</template>
