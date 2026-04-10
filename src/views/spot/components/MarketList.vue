<script setup lang="ts">
import type { PairItem } from '~~/types/spotTypes';
import { formatDisplay } from '@/utils/formatDisplay';

const props = defineProps<{
  pairs: PairItem[];
  selectedPair: string;
  searchQuery: string;
  listMaxHeightClass?: string;
}>();

const emit = defineEmits<{
  'update:searchQuery': [value: string];
  selectPair: [value: string];
}>();

const { t } = useI18n();

const searchText = computed({
    get: () => props.searchQuery,
    set: value => emit('update:searchQuery', value),
});

const filteredPairs = computed(() => {
    const keyword = searchText.value.trim().toLowerCase();
    if (!keyword) return props.pairs;
    return props.pairs.filter(item => item.symbol.toLowerCase().includes(keyword));
});

const listHeightClass = computed(() => props.listMaxHeightClass ?? 'max-h-[520px]');
</script>

<template>
    <div class="rounded-lg bg-white/90 shadow-sm dark:bg-slate-900/70">
        <div class="flex items-center justify-between px-2 py-2">
            <p class="text-sm font-semibold text-slate-900 dark:text-white">
                {{ t('交易对') }}
            </p>
            <UBadge color="primary" variant="soft">{{ t('现货标签') }}</UBadge>
        </div>

        <div class="space-y-2 px-2 pb-2">
            <UInput
                v-model="searchText"
                icon="i-heroicons-magnifying-glass-20-solid"
                :placeholder="t('搜索交易对')"
                size="sm"
            />

            <div class="space-y-2 overflow-y-auto pr-1" :class="listHeightClass">
                <button
                    v-for="item in filteredPairs"
                    :key="item.symbol"
                    type="button"
                    class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] transition"
                    :class="item.symbol === props.selectedPair
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-white/80 text-slate-600 hover:bg-slate-50 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-900/80'"
                    @click="emit('selectPair', item.symbol)"
                >
                    <div>
                        <p class="font-semibold text-slate-900 dark:text-white">
                            {{ item.symbol }}
                        </p>
                        <p class="text-[11px] text-slate-400">
                            {{ item.volume }}
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="text-slate-900 dark:text-white">{{ formatDisplay(item.price, 2) }}</p>
                        <p :class="item.tone === 'up' ? 'text-emerald-500' : 'text-rose-500'">
                            {{ item.change }}
                        </p>
                    </div>
                </button>
            </div>
        </div>
    </div>
</template>
