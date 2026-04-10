/**
 * useBinanceTradeStream — 币安逐笔成交 WebSocket 流
 *
 * 订阅 Binance `<symbol>@trade` 流，实时获取最新成交价与买卖方向。
 * - 支持响应式 symbol（MaybeRefOrGetter），切换交易对时自动断开并重连。
 * - 内置指数退避重连策略，最大重试间隔为 30 秒。
 * - 组件卸载时自动清理 WebSocket 连接，防止内存泄漏。
 */
import { computed, onBeforeUnmount, shallowRef, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import { createRuntimeGateway, isDesktopRuntime } from '~/services/runtime';
import type { RuntimeGateway, RuntimeSubscription, RuntimeUnlisten } from '~/services/runtime';
import { useRuntimeEventStore } from '~/store/runtimeEvent';

/** 币安 WebSocket 候选地址（失败时自动轮询） */
const BINANCE_STREAM_BASE_URLS = [
    'wss://data-stream.binance.vision/ws',
    'wss://stream.binance.com:9443/ws',
    'wss://stream.binance.com:443/ws',
];
/** 币安 REST 候选域名（WS 不可用时用于轮询兜底） */
const BINANCE_REST_BASE_URLS = [
    'https://api.binance.com',
    'https://api1.binance.com',
    'https://api2.binance.com',
    'https://api3.binance.com',
];

/** 首次重连基础延迟（ms），实际延迟按指数退避递增 */
const RECONNECT_BASE_DELAY = 1000;
/** 重连最大延迟上限（ms） */
const RECONNECT_MAX_DELAY = 30000;
/** WS 断开时的 REST 轮询周期（ms） */
const FALLBACK_POLL_INTERVAL = 1000;

/** useBinanceTradeStream 的入参选项 */
export interface UseBinanceTradeOptions {
    /** 交易对符号，支持响应式，默认为 'btcusdt' */
    symbol?: MaybeRefOrGetter<string | undefined>;
    /** 流类型：trade(原始逐笔) / aggTrade(聚合成交) */
    streamType?: MaybeRefOrGetter<'trade' | 'aggTrade' | undefined>;
}

/** 默认配置 */
const DEFAULT_OPTIONS: { symbol: string; streamType: 'trade' | 'aggTrade' } = {
    symbol: 'btcusdt',
    streamType: 'trade',
};

/**
 * 订阅 Binance 实时逐笔成交流
 * @param options 配置项，可指定交易对
 * @returns lastPrice（最新成交价）、side（买/卖方向）、isConnected（连接状态）、symbol（当前交易对）
 */
export function useBinanceTradeStream(options: UseBinanceTradeOptions = {}) {
    const runtimeEventStore = useRuntimeEventStore();
    /** 最新成交价，null 表示尚未收到数据 */
    const lastPrice = shallowRef<number | null>(null);
    /** 成交方向：'buy' 主动买入，'sell' 主动卖出，null 尚未收到 */
    const side = shallowRef<'buy' | 'sell' | null>(null);
    /** 最新成交量（基础币数量） */
    const lastQty = shallowRef<number | null>(null);
    /** 最新成交时间（毫秒时间戳） */
    const lastTradeTimeMs = shallowRef<number | null>(null);
    /** WebSocket 是否已成功连接 */
    const isConnected = shallowRef(false);
    /** 当前 WebSocket 实例引用 */
    const socketRef = shallowRef<WebSocket | null>(null);
    /** Desktop Runtime 网关实例 */
    let runtimeGateway: RuntimeGateway | null = null,
        /** Desktop Runtime 事件监听取消函数 */
        runtimeEventUnlisten: RuntimeUnlisten | null = null,
        /** Desktop Runtime 连接状态监听取消函数 */
        runtimeConnectionUnlisten: RuntimeUnlisten | null = null,
        /** 当前 Desktop Runtime 订阅 */
        activeRuntimeSubscription: RuntimeSubscription | null = null,
        /** 重连定时器句柄 */
        reconnectTimer: ReturnType<typeof setTimeout> | null = null,
        /** REST 轮询定时器句柄 */
        pollTimer: ReturnType<typeof setInterval> | null = null,
        /** 防止轮询请求并发 */
        pollInFlight = false,
        /** 当前重连尝试次数，用于指数退避计算 */
        reconnectAttempt = 0,
        /** 组件已销毁标记，防止销毁后继续重连 */
        destroyed = false;

    /** 将 symbol 选项解析为小写字符串（Binance 流要求小写） */
    const resolvedSymbol = computed(() => {
        const source = options.symbol ?? DEFAULT_OPTIONS.symbol;
        return (toValue(source) ?? DEFAULT_OPTIONS.symbol).toLowerCase();
    });
    const resolvedSymbolUpper = computed(() => resolvedSymbol.value.toUpperCase());

    /** 流订阅的 key，格式为 `<symbol>@trade` */
    const resolvedStreamType = computed<'trade' | 'aggTrade'>(() => {
        const source = options.streamType ?? DEFAULT_OPTIONS.streamType;
        return toValue(source) === 'aggTrade' ? 'aggTrade' : 'trade';
    });

    /** 流订阅的 key，格式为 `<symbol>@trade|aggTrade` */
    const streamKey = computed(() => `${resolvedSymbol.value}@${resolvedStreamType.value}`);

    function buildStreamUrl(attempt = 0) {
        const safeAttempt = Number.isFinite(attempt) && attempt >= 0 ? Math.floor(attempt) : 0;
        const baseUrl = BINANCE_STREAM_BASE_URLS[safeAttempt % BINANCE_STREAM_BASE_URLS.length]!;
        return `${baseUrl}/${streamKey.value}`;
    }

    /** 清除重连定时器 */
    function clearReconnectTimer() {
        if (reconnectTimer !== null) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }

    /** 清除 REST 轮询定时器 */
    function clearPollingTimer() {
        if (pollTimer !== null) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    /** 重置行情状态（切换交易对时调用） */
    function resetState() {
        lastPrice.value = null;
        side.value = null;
        lastQty.value = null;
        lastTradeTimeMs.value = null;
    }

    /**
     * 解析 WebSocket 消息体并更新响应式状态
     * @param payload 原始 JSON 消息对象
     */
    function upsertFromPayload(payload: any) {
        if (!payload || typeof payload !== 'object') return;
        const priceValue = Number(payload.p);
        if (!Number.isFinite(priceValue)) return;
        lastPrice.value = priceValue;

        const qtyValue = Number(payload.q);
        if (Number.isFinite(qtyValue)) {
            lastQty.value = qtyValue;
        }

        // Binance: T 为成交时间（trade time），单位毫秒。
        const timeValue = Number(payload.T ?? payload.t);
        if (Number.isFinite(timeValue)) {
            lastTradeTimeMs.value = timeValue;
        }

        // payload.m 为 true 表示是做市方卖出（即主动买入），false 表示主动卖出
        if (typeof payload.m === 'boolean') {
            side.value = payload.m ? 'sell' : 'buy';
        }
    }

    async function pollLatestTradeOnce() {
        if (destroyed || isConnected.value || pollInFlight) {
            return;
        }

        pollInFlight = true;
        try {
            for (const baseUrl of BINANCE_REST_BASE_URLS) {
                try {
                    const response = await fetch(`${baseUrl}/api/v3/trades?symbol=${resolvedSymbolUpper.value}&limit=1`);
                    if (!response.ok) {
                        continue;
                    }
                    const payload = await response.json();
                    const trade = Array.isArray(payload) ? payload[0] : null;
                    if (!trade || typeof trade !== 'object') {
                        continue;
                    }

                    const tradeRecord = trade as Record<string, unknown>;
                    const priceValue = Number(tradeRecord.price);
                    if (!Number.isFinite(priceValue)) {
                        continue;
                    }
                    lastPrice.value = priceValue;

                    const qtyValue = Number(tradeRecord.qty);
                    if (Number.isFinite(qtyValue)) {
                        lastQty.value = qtyValue;
                    }

                    const timeValue = Number(tradeRecord.time);
                    if (Number.isFinite(timeValue)) {
                        lastTradeTimeMs.value = timeValue;
                    }

                    if (typeof tradeRecord.isBuyerMaker === 'boolean') {
                        side.value = tradeRecord.isBuyerMaker ? 'sell' : 'buy';
                    }
                    return;
                } catch {
                    // 当前域名失败时继续尝试下一个域名。
                }
            }
        } finally {
            pollInFlight = false;
        }
    }

    function ensureFallbackPolling() {
        if (pollTimer !== null) {
            return;
        }
        pollTimer = setInterval(() => {
            void pollLatestTradeOnce();
        }, FALLBACK_POLL_INTERVAL);
        void pollLatestTradeOnce();
    }

    /** 断开当前 WebSocket 连接，并清除重连定时器 */
    function disconnect() {
        clearReconnectTimer();
        clearPollingTimer();
        socketRef.value?.close();
        socketRef.value = null;
        isConnected.value = false;
        runtimeEventStore.dispatchConnectionState({
            state: 'offline',
            source: 'websocket',
            timestamp: Date.now(),
        });
        void disconnectDesktopRuntime();
    }

    async function callUnlisten(unlisten: RuntimeUnlisten | null) {
        if (!unlisten) return;
        await unlisten();
    }

    async function disconnectDesktopRuntime() {
        if (runtimeGateway && activeRuntimeSubscription) {
            await runtimeGateway.unsubscribe(activeRuntimeSubscription);
        }

        await callUnlisten(runtimeEventUnlisten);
        await callUnlisten(runtimeConnectionUnlisten);
        runtimeEventUnlisten = null;
        runtimeConnectionUnlisten = null;
        activeRuntimeSubscription = null;

        if (runtimeGateway) {
            await runtimeGateway.disconnect();
            runtimeGateway = null;
        }
    }

    async function connectDesktopRuntime() {
        await disconnectDesktopRuntime();

        const gateway = createRuntimeGateway({
            web: {
                url: buildStreamUrl(reconnectAttempt),
            },
            preferDesktop: true,
        });
        runtimeGateway = gateway;

        runtimeEventUnlisten = gateway.onEvent((event) => {
            runtimeEventStore.dispatchRuntimeEvent(event);
            if (event.channel !== 'market.trade.tick') {
                return;
            }

            const { payload } = event;
            if (!payload || typeof payload !== 'object') {
                return;
            }

            const tradePayload = payload as Record<string, unknown>;
            if (tradePayload.e !== 'trade' && tradePayload.e !== 'aggTrade') {
                return;
            }

            upsertFromPayload(tradePayload);
        });

        runtimeConnectionUnlisten = gateway.onConnectionState((event) => {
            runtimeEventStore.dispatchConnectionState(event);
            isConnected.value = event.state === 'ready';
        });

        await gateway.connect();

        const runtimeSubscription: RuntimeSubscription = {
            channel: 'market.trade.tick',
            topic: streamKey.value,
        };

        activeRuntimeSubscription = runtimeSubscription;
        await gateway.subscribe(runtimeSubscription);
    }

    /**
     * 安排下一次重连，采用指数退避策略
     */
    function scheduleReconnect() {
        if (destroyed) return;
        const delay = Math.min(RECONNECT_BASE_DELAY * 2 ** reconnectAttempt, RECONNECT_MAX_DELAY);
        reconnectAttempt++;
        reconnectTimer = setTimeout(() => {
            if (!destroyed) connectTo(buildStreamUrl(reconnectAttempt));
        }, delay);
    }

    /**
     * 建立 WebSocket 连接并绑定事件监听
     * @param url 要连接的 WebSocket 地址
     */
    function connectTo(url: string) {
        // SSR 环境或连接已存在时，跳过
        if (import.meta.server || socketRef.value) return;

        const socket = new WebSocket(url);
        socketRef.value = socket;

        socket.addEventListener('open', () => {
            // 连接成功，重置重连计数
            reconnectAttempt = 0;
            isConnected.value = true;
            clearPollingTimer();
            runtimeEventStore.dispatchConnectionState({
                state: 'ready',
                source: 'websocket',
                timestamp: Date.now(),
            });
        });

        socket.addEventListener('message', (event) => {
            const payload = JSON.parse(event.data);
            // 只处理 trade / aggTrade 事件类型
            if (payload?.e !== 'trade' && payload?.e !== 'aggTrade') return;
            runtimeEventStore.dispatchRuntimeEvent({
                type: 'runtime.event',
                channel: 'market.trade.tick',
                timestamp: Date.now(),
                payload,
                sequence: typeof payload?.E === 'number' ? payload.E : undefined,
                source: 'websocket',
            });
            upsertFromPayload(payload);
        });

        socket.addEventListener('close', () => {
            // 连接关闭后安排重连
            isConnected.value = false;
            socketRef.value = null;
            ensureFallbackPolling();
            runtimeEventStore.dispatchConnectionState({
                state: 'reconnecting',
                source: 'websocket',
                timestamp: Date.now(),
            });
            scheduleReconnect();
        });

        socket.addEventListener('error', () => {
            // 触发 error 后关闭连接，close 事件会负责后续重连
            socket.close();
        });
    }

    /** 使用当前 streamUrl 发起连接 */
    function connect() {
        connectTo(buildStreamUrl(reconnectAttempt));
    }

    // 仅在客户端侧监听 streamKey 变化，symbol 改变时自动重连
    if (import.meta.client) {
        watch(
            streamKey,
            async () => {
                destroyed = false;
                reconnectAttempt = 0;
                disconnect();
                resetState();

                if (isDesktopRuntime()) {
                    await connectDesktopRuntime();
                    return;
                }

                connect();
                ensureFallbackPolling();
            },
            { immediate: true },
        );
    }

    // 组件卸载前清理连接资源
    onBeforeUnmount(() => {
        destroyed = true;
        disconnect();
        clearPollingTimer();
        void disconnectDesktopRuntime();
    });

    return {
        /** 最新成交价（响应式） */
        lastPrice,
        /** 成交方向（响应式） */
        side,
        /** 最新成交量（响应式） */
        lastQty,
        /** 最新成交时间戳（响应式） */
        lastTradeTimeMs,
        /** WebSocket 连接状态（响应式） */
        isConnected,
        /** 当前解析后的交易对符号（响应式） */
        symbol: resolvedSymbol,
        /** 当前流类型（响应式） */
        streamType: resolvedStreamType,
    };
}
