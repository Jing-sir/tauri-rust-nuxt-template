/**
 * useOrders — 现货订单与成交记录管理
 *
 * 从 spotRepository 并发加载当前委托、历史委托和我的成交三类数据，
 * 提供统一的加载状态与手动刷新入口。
 * - 组件挂载时自动发起数据请求（三个请求并发执行，互不阻塞）。
 * - `hasOrders` 用于快速判断是否存在任何委托记录，可用于控制 UI 空态展示。
 */
import { computed, onMounted, shallowRef } from 'vue';
import { createSpotRepository } from '@/features/spot/repository/spotRepository';
import type { OrderItem, TradeItem } from '~~/types/spotTypes';

/**
 * 现货委托、历史委托与成交记录管理
 * @returns openOrders、historyOrders、myTrades、isLoading、hasOrders、refresh
 */
export const useOrders = () => {
    // 通过工厂函数获取 spot 数据访问层实例
    const repository = createSpotRepository();

    /** 当前挂单（未成交委托）列表 */
    const openOrders = shallowRef<OrderItem[]>([]);
    /** 历史委托（已完成/已取消）列表 */
    const historyOrders = shallowRef<OrderItem[]>([]);
    /** 我的成交记录列表 */
    const myTrades = shallowRef<TradeItem[]>([]);

    /** 数据加载中状态 */
    const isLoading = shallowRef(false);

    /**
     * 并发拉取三类订单数据
     * 使用 Promise.all 并行请求，降低整体等待时间
     */
    const refresh = async () => {
        isLoading.value = true;

        try {
            const [nextOpenOrders, nextHistoryOrders, nextMyTrades] =
                await Promise.all([
                    repository.getOpenOrders(),      // 当前委托
                    repository.getOrderHistory(),     // 历史委托
                    repository.getMyTrades(),         // 我的成交
                ]);

            openOrders.value = nextOpenOrders;
            historyOrders.value = nextHistoryOrders;
            myTrades.value = nextMyTrades;
        } finally {
            isLoading.value = false;
        }
    };

    /**
     * 是否存在任何委托记录（当前委托或历史委托非空）
     * 可用于控制订单面板的空态提示
     */
    const hasOrders = computed(
        () => openOrders.value.length > 0 || historyOrders.value.length > 0,
    );

    // 组件挂载后立即加载订单数据
    onMounted(() => {
        void refresh();
    });

    return {
        /** 当前委托列表（响应式） */
        openOrders,
        /** 历史委托列表（响应式） */
        historyOrders,
        /** 我的成交记录列表（响应式） */
        myTrades,
        /** 数据加载状态（响应式） */
        isLoading,
        /** 是否存在任何委托记录（响应式计算属性） */
        hasOrders,
        /** 手动刷新所有订单数据 */
        refresh,
    };
};