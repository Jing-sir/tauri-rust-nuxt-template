<script setup lang="ts">
import DeptchChart from './DeptchChart/index.vue';
import type { DepthPointInput } from './DeptchChart/hooks/useDepthChartMarket';

    /**
     * Compatibility wrapper.
     *
     * 历史原因:
     * - 项目里原来引用的是 `src/components/DepthChart.vue`
     * - 现在深度图主体组件迁移到了 `src/components/DeptchChart/index.vue`（目录名保留了原先拼写）
     *
     * 这个文件只负责:
     * - 透传 props
     * - 转发 emits（包括 kebab/camel 的事件名差异）
     *
     * 深度图交互/绘制逻辑请看:
     * - `src/components/DeptchChart/index.vue`
     * - `src/components/DeptchChart/hooks/*`
     */
    interface Props {
        buyList?: DepthPointInput[];
        sellList?: DepthPointInput[];
        priceText?: string;
        numText?: string;
        decimal?: number;
        priceUnit?: string;
        sizeUnit?: string;
        chartHeight?: number;
        smoothing?: number;
        initialDepthMax?: number;
        level?: 10 | 20;
        speed?: '100ms' | '1000ms';
        showVolume?: boolean;
        depthText?: string;
        speedText?: string;
        volumeText?: string;
        bidText?: string;
        askText?: string;
        spreadText?: string;
        totalText?: string;
        lineColor?: string;
        downColor?: string;
        upColor?: string;
    }

const props = defineProps<Props>();
const emit = defineEmits<{
        (event: 'update:level', value: 10 | 20): void;
        (event: 'update:speed', value: '100ms' | '1000ms'): void;
        (event: 'update:showVolume', value: boolean): void;
    }>();
</script>

<template>
    <!-- Vue 模板事件名默认 kebab-case，这里显式桥接到父组件的 camelCase emit -->
    <DeptchChart
        v-bind="props"
        @update:level="emit('update:level', $event)"
        @update:speed="emit('update:speed', $event)"
        @update:show-volume="emit('update:showVolume', $event)"
    />
</template>
