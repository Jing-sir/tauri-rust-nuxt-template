<script setup lang="ts">
import { dataThousands } from '@/filters/dataThousands';

const props = defineProps<{
  price?: number | null;
  side?: 'buy' | 'sell' | null;
  quoteCurrency?: string;
}>();

const priceValue = computed(() => (typeof props.price === 'number' && Number.isFinite(props.price) ? props.price : null));
const priceDisplay = computed(() =>
    priceValue.value === null ? '--' : dataThousands(priceValue.value.toFixed(2))
);

const showUsd = computed(() => props.quoteCurrency === 'USDT' || props.quoteCurrency === 'USD');
const usdDisplay = computed(() =>
    priceValue.value === null || !showUsd.value ? '' : `≈ $${dataThousands(priceValue.value.toFixed(2))}`
);

const flashClass = shallowRef('');
let flashTimer: ReturnType<typeof setTimeout> | null = null;

watch(
    () => priceValue.value,
    (value, oldValue) => {
        if (typeof value !== 'number' || typeof oldValue !== 'number') return;
        if (value === oldValue) return;
        flashClass.value = value > oldValue ? 'flash-up' : 'flash-down';
        if (flashTimer) globalThis.clearTimeout(flashTimer);
        flashTimer = globalThis.setTimeout(() => {
            flashClass.value = '';
        }, 220);
    },
);

onBeforeUnmount(() => {
    // Avoid delayed state mutation after component unmount.
    if (flashTimer) {
        globalThis.clearTimeout(flashTimer);
        flashTimer = null;
    }
});
</script>

<template>
    <div class="flex h-8 items-center justify-start rounded-md text-left">
        <div class="flex items-baseline gap-2">
            <span
                class="text-base font-semibold"
                :class="[
                    props.side === 'buy'
                        ? 'text-emerald-500'
                        : props.side === 'sell'
                            ? 'text-rose-500'
                            : 'text-slate-900 dark:text-white',
                    flashClass,
                ]"
            >
                <span>{{ priceDisplay }}</span>
                <span v-if="props.side === 'buy'" class="ml-1 align-middle text-[13px]">↑</span>
                <span v-else-if="props.side === 'sell'" class="ml-1 align-middle text-[13px]">↓</span>
            </span>
            <span v-if="usdDisplay" class="text-[11px] font-medium text-slate-400">
                {{ usdDisplay }}
            </span>
        </div>
    </div>
</template>

<style scoped>
.flash-up {
  animation: flashUp 220ms ease-out;
}
.flash-down {
  animation: flashDown 220ms ease-out;
}
@keyframes flashUp {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}
@keyframes flashDown {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}
</style>
