/**
 * useSpotMarkets — 现货交易对列表管理
 *
 * 负责从 spotRepository 加载交易对列表，并维护搜索关键词与当前选中的交易对状态。
 * - 组件挂载时自动发起数据请求。
 * - 提供 `selectedPairMeta` 快捷计算选中交易对的完整元数据。
 * - 提供 `chartSymbol` 用于传给图表组件（去掉斜线并转小写）。
 */
import { computed, onMounted, shallowRef } from 'vue';
import { createSpotRepository } from '@/features/spot/repository/spotRepository';
import type { PairItem } from '~~/types/spotTypes';

/**
 * 现货交易对列表与搜索/选中状态管理
 * @returns pairs、searchQuery、selectedPair、selectedPairMeta、chartSymbol、refresh
 */
export const useSpotMarkets = () => {
    // 通过工厂函数获取 spot 数据访问层实例
    const repository = createSpotRepository();

    /** 所有交易对列表 */
    const pairs = shallowRef<PairItem[]>([]);
    /** 搜索输入框的关键词 */
    const searchQuery = shallowRef('');
    /** 当前选中的交易对符号，格式为 "BASE/QUOTE"，如 "BTC/USDT" */
    const selectedPair = shallowRef('BTC/USDT');

    /**
     * 选中交易对的完整元数据
     * - 优先从 pairs 中查找匹配项
     * - 找不到时降级为列表第一项
     */
    const selectedPairMeta = computed(
        () =>
            pairs.value.find(item => item.symbol === selectedPair.value) ??
            pairs.value[0],
    );

    /**
     * 图表用的交易对符号
     * 将 "BTC/USDT" 转换为 "btcusdt"，符合 Binance 流的命名要求
     */
    const chartSymbol = computed(() =>
        selectedPair.value.replace('/', '').toLowerCase(),
    );

    /** 从 repository 重新拉取交易对列表 */
    const refresh = async () => {
        const nextPairs = await repository.getPairs();
        pairs.value = nextPairs;
    };

    // 组件挂载后立即加载数据
    onMounted(() => {
        void refresh();
    });

    return {
        /** 交易对列表（响应式） */
        pairs,
        /** 搜索关键词（响应式） */
        searchQuery,
        /** 当前选中的交易对符号（响应式） */
        selectedPair,
        /** 选中交易对的完整元数据（响应式计算属性） */
        selectedPairMeta,
        /** 图表组件用的小写连体符号，如 "btcusdt"（响应式计算属性） */
        chartSymbol,
        /** 手动刷新交易对列表 */
        refresh,
    };
};