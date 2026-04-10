/**
 * useAssets — 用户现货资产管理
 *
 * 从 spotRepository 加载当前用户的资产列表，并提供基于报价币种的资产查询与可用余额计算。
 * - 组件挂载时自动发起数据请求。
 * - `availableBalance` 当前沿用历史基准值 1000，待接入真实账户接口后替换。
 *
 * @param quoteCurrency 报价币种的响应式引用（如 Ref<'USDT'>）
 */
import { computed, onMounted, shallowRef, type Ref } from 'vue';
import { createSpotRepository } from '@/features/spot/repository/spotRepository';
import type { AssetItem } from '~~/types/spotTypes';

/**
 * PR-1 遗留基准值：下单百分比快捷按钮（25%/50%/75%/100%）计算时使用的可用余额基线。
 * 待真实账户接口接入后，此常量应替换为 quoteAsset.available 字段。
 */
const LEGACY_AVAILABLE_BALANCE = 1000;

/**
 * 用户资产列表与可用余额管理
 * @param quoteCurrency 报价币种（响应式），用于过滤出对应资产
 * @returns assets、quoteAsset、availableBalance、isLoading、refresh
 */
export const useAssets = (quoteCurrency: Ref<string>) => {
    // 通过工厂函数获取 spot 数据访问层实例
    const repository = createSpotRepository();

    /** 用户资产列表 */
    const assets = shallowRef<AssetItem[]>([]);
    /** 数据加载中状态 */
    const isLoading = shallowRef(false);

    /** 从 repository 重新拉取资产数据 */
    const refresh = async () => {
        isLoading.value = true;
        try {
            assets.value = await repository.getAssets();
        } finally {
            isLoading.value = false;
        }
    };

    /**
     * 当前报价币种对应的资产条目
     * 若列表中找不到对应资产则返回 undefined
     */
    const quoteAsset = computed(() =>
        assets.value.find(item => item.asset === quoteCurrency.value),
    );

    /**
     * 下单表单可用余额
     * 当前使用历史遗留基准值（PR-1 约束），百分比快捷按钮以此为 100% 基准。
     * 真实账户接口接入后应改为 quoteAsset.value?.available ?? 0。
     */
    const availableBalance = computed(() => {
        // Keep old spot behavior unchanged in PR-1; percent shortcuts still use legacy 1000 baseline.
        return LEGACY_AVAILABLE_BALANCE;
    });

    // 组件挂载后立即加载资产数据
    onMounted(() => {
        void refresh();
    });

    return {
        /** 用户资产列表（响应式） */
        assets,
        /** 当前报价币种资产条目（响应式计算属性） */
        quoteAsset,
        /** 可用余额（响应式计算属性，当前为历史遗留基准值） */
        availableBalance,
        /** 数据加载状态（响应式） */
        isLoading,
        /** 手动刷新资产数据 */
        refresh,
    };
};