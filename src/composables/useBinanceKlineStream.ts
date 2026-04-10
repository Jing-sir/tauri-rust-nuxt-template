/**
 * useBinanceKlineStream — 币安 K 线 WebSocket 流
 *
 * 订阅 Binance `<symbol>@kline_<interval>` 流，实时维护 K 线蜡烛数组与最新收盘价。
 * - 支持响应式 symbol、interval、maxCandles，任一变化时自动重连并清空旧数据。
 * - 内置指数退避重连策略，最大重试间隔为 30 秒。
 * - maxCandles 减小时，自动裁剪已缓存的蜡烛数组，避免渲染性能下降。
 * - 组件卸载时自动清理 WebSocket 连接，防止内存泄漏。
 */
import { computed, onBeforeUnmount, shallowRef, toValue, triggerRef, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

/** 币安 WebSocket 候选地址（失败时自动轮询） */
const BINANCE_STREAM_BASE_URLS = [
    'wss://data-stream.binance.vision/ws',
    'wss://stream.binance.com:9443/ws',
    'wss://stream.binance.com:443/ws',
];

/** 首次重连基础延迟（ms） */
const RECONNECT_BASE_DELAY = 1000;
/** 重连最大延迟上限（ms） */
const RECONNECT_MAX_DELAY = 30000;

/** 支持的 K 线周期类型 */
export type BinanceInterval = '1m' | '5m' | '15m' | '1h';

/** 单根 K 线蜡烛数据结构 */
export interface Candle {
    /** 开盘时间戳（秒） */
    time: number;
    /** 开盘价 */
    open: number;
    /** 最高价 */
    high: number;
    /** 最低价 */
    low: number;
    /** 收盘价 */
    close: number;
    /** 成交量 */
    volume: number;
}

/** useBinanceKlineStream 的入参选项 */
export interface UseBinanceKlineOptions {
    /** 交易对符号，支持响应式，默认为 'btcusdt' */
    symbol?: MaybeRefOrGetter<string | undefined>;
    /** K 线周期，支持响应式，默认为 '15m' */
    interval?: MaybeRefOrGetter<BinanceInterval | undefined>;
    /** 保留的最大蜡烛数量，支持响应式，默认为 500 */
    maxCandles?: MaybeRefOrGetter<number | undefined>;
}

/** useBinanceKlineStream 默认配置 */
const DEFAULT_OPTIONS: { symbol: string; interval: BinanceInterval; maxCandles: number } = {
    symbol: 'btcusdt',
    interval: '15m',
    maxCandles: 500,
};

/** useBinanceKlineStream 返回值类型（用于外部类型推导） */
export type UseBinanceKlineStreamReturn = ReturnType<typeof useBinanceKlineStream>;

/**
 * 订阅 Binance 实时 K 线流
 * @param options 配置项，可指定交易对、周期和最大蜡烛数
 * @returns candles（K 线数组）、lastPrice（最新收盘价）、isConnected（连接状态）、symbol、interval
 */
export function useBinanceKlineStream(options: UseBinanceKlineOptions = {}) {
    /** K 线蜡烛数组，按时间升序排列 */
    const candles = shallowRef<Candle[]>([]);
    /** 最新一根蜡烛（包含未收线中的实时更新） */
    const latestCandle = shallowRef<Candle | null>(null);
    /** 最新 K 线收盘价，null 表示尚未收到数据 */
    const lastPrice = shallowRef<number | null>(null);
    /** WebSocket 是否已成功连接 */
    const isConnected = shallowRef(false);
    /** 当前 WebSocket 实例引用 */
    const socketRef = shallowRef<WebSocket | null>(null);
    /** 重连定时器句柄 */
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null,
        /** 当前重连尝试次数，用于指数退避计算 */
        reconnectAttempt = 0,
        /** 组件已销毁标记，防止销毁后继续重连 */
        destroyed = false;

    /** 解析 symbol 为小写字符串（Binance 流要求小写） */
    const resolvedSymbol = computed(() => {
        const source = options.symbol ?? DEFAULT_OPTIONS.symbol;
        return (toValue(source) ?? DEFAULT_OPTIONS.symbol).toLowerCase();
    });

    /** 解析 interval，保证类型安全 */
    const resolvedInterval = computed<BinanceInterval>(() => {
        const source = options.interval ?? DEFAULT_OPTIONS.interval;
        return toValue(source) ?? DEFAULT_OPTIONS.interval;
    });

    /** 解析 maxCandles，非正数时降级为默认值 */
    const resolvedMaxCandles = computed<number>(() => {
        const source = options.maxCandles ?? DEFAULT_OPTIONS.maxCandles;
        const value = toValue(source);
        return typeof value === 'number' && value > 0 ? value : DEFAULT_OPTIONS.maxCandles;
    });

    /** 流订阅的 key，格式为 `<symbol>@kline_<interval>` */
    const streamKey = computed(() => `${resolvedSymbol.value}@kline_${resolvedInterval.value}`);

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

    /** 重置 K 线数组和最新价（切换交易对/周期时调用） */
    function resetSeries() {
        candles.value = [];
        latestCandle.value = null;
        lastPrice.value = null;
    }

    /**
     * 解析 WebSocket K 线消息并更新 candles 数组
     * - 若最后一根蜡烛时间相同则原地更新（同一根 K 线持续刷新）
     * - 否则追加新蜡烛，并在超过 maxCandles 时移除最旧的一根
     * @param payload 原始 JSON 消息对象
     */
    function upsertFromPayload(payload: any) {
        const kline = payload?.k;
        if (!kline) return;

        const candle: Candle = {
            time: kline.t / 1000,   // Binance 时间戳为毫秒，转为秒
            open: Number(kline.o),
            high: Number(kline.h),
            low: Number(kline.l),
            close: Number(kline.c),
            volume: Number(kline.v),
        };
        if (
            !Number.isFinite(candle.time) ||
            !Number.isFinite(candle.open) ||
            !Number.isFinite(candle.high) ||
            !Number.isFinite(candle.low) ||
            !Number.isFinite(candle.close) ||
            !Number.isFinite(candle.volume)
        ) {
            return;
        }

        const series = candles.value;
        const last = series[series.length - 1];
        let changed = false;

        if (last && last.time === candle.time) {
            // 同一根 K 线刷新：原地更新，减少数组复制开销。
            if (
                last.open !== candle.open ||
                last.high !== candle.high ||
                last.low !== candle.low ||
                last.close !== candle.close ||
                last.volume !== candle.volume
            ) {
                last.open = candle.open;
                last.high = candle.high;
                last.low = candle.low;
                last.close = candle.close;
                last.volume = candle.volume;
                changed = true;
            }
        } else {
            // 新 K 线：追加，并按 maxCandles 滚动裁剪。
            series.push(candle);
            if (series.length > resolvedMaxCandles.value) {
                series.shift();
            }
            changed = true;
        }

        if (changed) {
            triggerRef(candles);
        }
        latestCandle.value = candle;
        lastPrice.value = candle.close;
    }

    /** 断开当前 WebSocket 连接，并清除重连定时器 */
    function disconnect() {
        clearReconnectTimer();
        socketRef.value?.close();
        socketRef.value = null;
        isConnected.value = false;
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
        });

        socket.addEventListener('message', (event) => {
            const payload = JSON.parse(event.data);
            // 只处理 kline 类型事件
            if (payload?.e !== 'kline') return;
            upsertFromPayload(payload);
        });

        socket.addEventListener('close', () => {
            // 连接关闭后安排重连
            isConnected.value = false;
            socketRef.value = null;
            scheduleReconnect();
        });

        socket.addEventListener('error', () => {
            // 触发 error 后关闭连接，close 事件会负责后续重连
            socket.close();
        });
    }

    // 仅在客户端侧监听 streamKey 变化，symbol 或 interval 改变时自动重连
    if (import.meta.client) {
        watch(
            streamKey,
            () => {
                destroyed = false;
                reconnectAttempt = 0;
                disconnect();
                resetSeries();
                connectTo(buildStreamUrl(reconnectAttempt));
            },
            { immediate: true },
        );
    }

    // maxCandles 减小时，裁剪已缓存的蜡烛数组
    watch(
        resolvedMaxCandles,
        (limit) => {
            if (candles.value.length > limit) {
                candles.value.splice(0, candles.value.length - limit);
                triggerRef(candles);
            }
        },
        { immediate: true },
    );

    // 组件卸载前清理连接资源
    onBeforeUnmount(() => {
        destroyed = true;
        disconnect();
    });

    return {
        /** K 线蜡烛数组（响应式，按时间升序） */
        candles,
        /** 最新蜡烛（响应式） */
        latestCandle,
        /** 最新 K 线收盘价（响应式） */
        lastPrice,
        /** WebSocket 连接状态（响应式） */
        isConnected,
        /** 当前解析后的交易对符号（响应式） */
        symbol: resolvedSymbol,
        /** 当前 K 线周期（响应式） */
        interval: resolvedInterval,
    };
}
