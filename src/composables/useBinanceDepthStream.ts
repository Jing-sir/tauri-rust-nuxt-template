/**
 * useBinanceDepthStream — 币安深度（盘口）WebSocket 流
 *
 * 订阅 Binance `<symbol>@depth` 或 `<symbol>@depth<level>` 流，
 * 实时维护买盘（bids）与卖盘（asks）的深度数据。
 *
 * 核心机制：
 * - **diff 模式**：先拉取 REST 快照，再将 WebSocket 的增量 diff 事件按 Binance 官方对齐规则合并进本地订单簿。
 * - **partial 模式**：每条 WebSocket 消息即为完整的局部快照，直接覆盖写入。
 * - **三种引擎**：`js`（纯 JS Map）、`wasm`（主线程 WASM 模块）、`wasm-worker`（Worker + WASM，避免主线程阻塞）。
 * - **节流发布**：引擎每次 delta/snapshot 更新后不直接修改 Vue 响应式状态，
 *   而是通过 `schedulePublish` 以 `publishIntervalMs` 频率批量推送，减少渲染压力。
 * - **SSR 预取**：服务端通过 `onServerPrefetch` 拉取快照并注入 `useState`，
 *   客户端水合时直接读取，避免首帧白屏。
 * - **自动重同步**：检测到 diff gap（序列号不连续）或 pending 队列溢出时，触发快照重载。
 * - 组件卸载时自动清理所有资源（WebSocket、定时器、WASM 引擎/Worker）。
 */
import { computed, onBeforeUnmount, onServerPrefetch, shallowRef, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import binanceOrderbookWasmUrl from 'binance-orderbook-wasm/binance_orderbook_wasm_bg.wasm?url';
import { createRuntimeGateway, isDesktopRuntime } from '~/services/runtime';
import type { RuntimeGateway, RuntimeSubscription, RuntimeUnlisten } from '~/services/runtime';
import { useRuntimeEventStore } from '~/store/runtimeEvent';

/** 币安 WebSocket 候选地址（失败时自动轮询） */
const BINANCE_STREAM_BASE_URLS = [
    'wss://data-stream.binance.vision/ws',
    'wss://stream.binance.com:9443/ws',
    'wss://stream.binance.com:443/ws',
];
/** 币安 REST 深度快照候选域名（主域名失败时自动切换） */
const BINANCE_DEPTH_REST_BASES = [
    'https://api.binance.com',
    'https://api1.binance.com',
    'https://api2.binance.com',
    'https://api3.binance.com',
];

/** 首次重连基础延迟（ms） */
const RECONNECT_BASE_DELAY = 1000;
/** 重连最大延迟上限（ms） */
const RECONNECT_MAX_DELAY = 30000;

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

/** 局部深度流的档位数量（5 / 10 / 20） */
export type BinanceDepthLevel = 5 | 10 | 20;
/** WebSocket 推送速率 */
export type BinanceDepthSpeed = '100ms' | '1000ms';
/** 深度流模式：diff 增量 / partial 局部快照 */
export type BinanceDepthMode = 'diff' | 'partial';
/** REST 快照拉取的档位数量上限 */
export type BinanceDepthLimit = 20 | 50 | 100 | 200 | 500 | 1000;
/** 订单簿后端引擎类型 */
export type BinanceDepthEngine = 'js' | 'wasm' | 'wasm-worker';
/** 单个深度条目 [price, quantity]（均为 number） */
export type BinanceDepthEntry = [number, number];

/** 网络原始条目，price/quantity 均为字符串 */
type DepthWireEntry = [string, string];

/** 包含买卖盘原始字符串条目的消息体 */
type DepthBookPayload = {
    bids: DepthWireEntry[];
    asks: DepthWireEntry[];
};

/** 包含买卖盘数字条目的消息体 */
type DepthNumericPayload = {
    bids: BinanceDepthEntry[];
    asks: BinanceDepthEntry[];
};

/** REST 快照响应，包含 lastUpdateId */
type DepthSnapshotPayload = DepthBookPayload & {
    lastUpdateId: number | null;
};

/** 订单簿引擎抽象接口，三种实现（JS / WASM / Worker）均需遵循此契约 */
type DepthStore = {
    /** 加载完整快照，清空原有数据后重建 */
    applySnapshot: (snapshot: DepthBookPayload) => Promise<void>;
    /** 应用增量 delta，仅修改受影响档位 */
    applyDelta: (delta: DepthBookPayload) => Promise<void>;
    /** 按价格排序后返回买卖各 limit 档 */
    getDepth: (limit: number) => Promise<DepthNumericPayload>;
    /** 释放引擎资源（WASM free / Worker terminate） */
    destroy: () => void;
};

/** Worker 消息类型枚举 */
type WorkerRequestType = 'init' | 'apply_snapshot' | 'apply_delta' | 'get_depth' | 'dispose';

/** 发往 Worker 的请求消息结构 */
type WorkerRequest = {
    id: number;
    type: WorkerRequestType;
    maxDepth?: number;
    mode?: 'wasm' | 'js';
    snapshot?: DepthBookPayload;
    delta?: DepthBookPayload;
    limit?: number;
};

/** Worker 响应消息结构 */
type WorkerResponse = {
    id: number;
    ok: boolean;
    data?: unknown;
    error?: string;
};

/** WebSocket diff 消息的原始结构（字段命名参考 Binance 文档） */
type DepthDiffPayload = {
    /** 本次更新的首个 updateId */
    U?: number;
    /** 本次更新的末尾 updateId */
    u?: number;
    /** diff 模式的买盘更新（字段名 b） */
    b?: unknown;
    /** diff 模式的卖盘更新（字段名 a） */
    a?: unknown;
    /** partial 模式的买盘（字段名 bids） */
    bids?: unknown;
    /** partial 模式的卖盘（字段名 asks） */
    asks?: unknown;
};

/** 触发重同步（resync）的原因 */
type ResyncReason = 'bootstrap' | 'gap' | 'pending-overflow';

// ─── 入参选项 ──────────────────────────────────────────────────────────────────

/** useBinanceDepthStream 的入参选项 */
export interface UseBinanceDepthOptions {
    /** 交易对符号，支持响应式，默认为 'btcusdt' */
    symbol?: MaybeRefOrGetter<string | undefined>;
    /** 局部快照模式的档位数，支持响应式，默认为 10 */
    level?: MaybeRefOrGetter<BinanceDepthLevel | undefined>;
    /** WebSocket 推送速率，支持响应式，默认为 '100ms' */
    speed?: MaybeRefOrGetter<BinanceDepthSpeed | undefined>;
    /** 深度流模式（diff 增量 / partial 局部快照），支持响应式，默认为 'diff' */
    mode?: MaybeRefOrGetter<BinanceDepthMode | undefined>;
    /** REST 快照档位数，支持响应式，默认为 100 */
    limit?: MaybeRefOrGetter<BinanceDepthLimit | undefined>;
    /** 订单簿后端引擎，支持响应式，默认为 'wasm' */
    engine?: MaybeRefOrGetter<BinanceDepthEngine | undefined>;
    /**
     * UI 发布节流间隔（ms）：
     * - 引擎在每条 ws 消息后即更新内部数据
     * - Vue 响应式状态按此间隔批量发布，降低重渲染压力
     * 默认为 32ms（约 30fps）
     */
    publishIntervalMs?: MaybeRefOrGetter<number | undefined>;
}

/** 默认交易对 */
const DEFAULT_SYMBOL = 'btcusdt';

/** 各选项默认值 */
const DEFAULT_OPTIONS: {
    level: BinanceDepthLevel;
    speed: BinanceDepthSpeed;
    mode: BinanceDepthMode;
    limit: BinanceDepthLimit;
    engine: BinanceDepthEngine;
    publishIntervalMs: number;
} = {
    level: 10,
    speed: '100ms',
    mode: 'diff',
    limit: 100,
    engine: 'wasm',
    publishIntervalMs: 32,
};

/** 本地订单簿存储的最小档位深度（保证比 limit 更大，留有余量） */
const MIN_STORE_DEPTH = 1000;
/** pending 事件队列上限，超出后直接丢弃并触发重同步 */
const MAX_PENDING_EVENTS = 5000;

// ─── 纯工具函数 ────────────────────────────────────────────────────────────────

/**
 * 将任意数组安全转换为 DepthWireEntry[]
 * 跳过格式异常的条目（非数组、元素为 null/undefined 等）
 */
function normalizeWireEntries(value: unknown): DepthWireEntry[] {
    if (!Array.isArray(value)) return [];
    const result: DepthWireEntry[] = [];
    for (const item of value) {
        if (!Array.isArray(item) || item.length < 2) {
            continue;
        }
        const priceRaw = item[0];
        const qtyRaw = item[1];
        if (priceRaw === undefined || qtyRaw === undefined || priceRaw === null || qtyRaw === null) {
            continue;
        }
        result.push([String(priceRaw), String(qtyRaw)]);
    }
    return result;
}

/**
 * 校验并规范化 REST 快照响应体
 * 返回 null 表示响应格式无效
 */
function sanitizeSnapshotPayload(value: unknown): DepthSnapshotPayload | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const payload = value as Record<string, unknown>;
    const lastUpdateId = typeof payload.lastUpdateId === 'number' ? payload.lastUpdateId : null;
    return {
        bids: normalizeWireEntries(payload.bids),
        asks: normalizeWireEntries(payload.asks),
        lastUpdateId,
    };
}

/**
 * 将任意数组安全转换为 BinanceDepthEntry[]（price/qty 均已解析为 number）
 * 跳过无法解析为有限数字的条目
 */
function normalizeNumericEntries(value: unknown): BinanceDepthEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const result: BinanceDepthEntry[] = [];
    for (const item of value) {
        if (!Array.isArray(item) || item.length < 2) {
            continue;
        }
        const priceRaw = item[0];
        const qtyRaw = item[1];
        const price = Number(priceRaw);
        const qty = Number(qtyRaw);
        if (!Number.isFinite(price) || !Number.isFinite(qty)) {
            continue;
        }
        result.push([price, qty]);
    }
    return result;
}

function hasDepthEntriesChanged(prev: BinanceDepthEntry[], next: BinanceDepthEntry[]) {
    if (prev.length !== next.length) {
        return true;
    }

    for (let i = 0; i < prev.length; i += 1) {
        const prevEntry = prev[i]!;
        const nextEntry = next[i]!;
        if (prevEntry[0] !== nextEntry[0] || prevEntry[1] !== nextEntry[1]) {
            return true;
        }
    }

    return false;
}

// ─── 引擎工厂：JS ──────────────────────────────────────────────────────────────

/**
 * 在有序数组中用二分法找到目标 price 的插入位置
 * @param arr      已排序的 [price, qty] 数组
 * @param price    要查找/插入的价格
 * @param descending true = 降序（买盘），false = 升序（卖盘）
 * @returns 第一个 price <= (降序) 或 >= (升序) 目标的索引
 */
function binarySearchIndex(arr: BinanceDepthEntry[], price: number, descending: boolean): number {
    let lo = 0,
        hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const midPrice = arr[mid]![0];
        if (descending ? midPrice > price : midPrice < price) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

/**
 * 将单个档位更新应用到有序数组
 * - qty === 0 → 删除
 * - 否则 → 更新已存在的档位，或在正确位置插入新档位
 * @param arr        目标有序数组（降序或升序）
 * @param price      档位价格
 * @param qty        档位数量（0 表示删除）
 * @param descending 是否降序排列（买盘）
 */
function applySortedEntry(arr: BinanceDepthEntry[], price: number, qty: number, descending: boolean) {
    const idx = binarySearchIndex(arr, price, descending);
    const existing = arr[idx];

    if (existing && existing[0] === price) {
        if (!qty) {
            arr.splice(idx, 1); // 删除
        } else {
            existing[1] = qty; // 就地更新
        }
        return;
    }

    if (qty) {
        arr.splice(idx, 0, [price, qty]); // 插入新档位
    }
    // qty === 0 且不存在 → 无需操作
}

/**
 * 将 DepthWireEntry[] 批量应用到有序 BinanceDepthEntry[] 数组
 * 替代 Map 方案，维护插入后的有序性，让 getDepth 变为 O(limit) 切片。
 */
function applySideUpdatesToSortedArray(target: BinanceDepthEntry[], updates: DepthWireEntry[], descending: boolean) {
    for (const [priceRaw, qtyRaw] of updates) {
        const price = Number(priceRaw);
        const qty = Number(qtyRaw);
        if (!Number.isFinite(price)) {
            continue;
        }
        applySortedEntry(target, price, qty, descending);
    }
}

/**
 * 创建纯 JS 实现的订单簿引擎
 * 使用两个有序数组分别维护买盘（降序）和卖盘（升序），
 * 每次增量写入后保持有序，getDepth 只需 O(limit) 切片，无需全量排序。
 */
function createJsDepthStore(): DepthStore {
    /** 买盘：降序有序 [price, qty] 数组 */
    const bidsSorted: BinanceDepthEntry[] = [];
    /** 卖盘：升序有序 [price, qty] 数组 */
    const asksSorted: BinanceDepthEntry[] = [];

    return {
        async applySnapshot(snapshot) {
            // 清空旧数据，重建有序数组
            bidsSorted.length = 0;
            asksSorted.length = 0;
            applySideUpdatesToSortedArray(bidsSorted, snapshot.bids, true);
            applySideUpdatesToSortedArray(asksSorted, snapshot.asks, false);
        },
        async applyDelta(delta) {
            // 增量更新：按价格二分定位后原地插入/更新/删除
            applySideUpdatesToSortedArray(bidsSorted, delta.bids, true);
            applySideUpdatesToSortedArray(asksSorted, delta.asks, false);
        },
        async getDepth(limit) {
            // 数组已保持有序，直接切片返回，O(limit)
            return {
                bids: bidsSorted.slice(0, limit) as BinanceDepthEntry[],
                asks: asksSorted.slice(0, limit) as BinanceDepthEntry[],
            };
        },
        destroy() {
            bidsSorted.length = 0;
            asksSorted.length = 0;
        },
    };
}

// ─── 引擎工厂：WASM ────────────────────────────────────────────────────────────

/** WASM 模块单例 Promise，确保只加载一次 */
let wasmModulePromise: Promise<typeof import('binance-orderbook-wasm')> | null = null;

/**
 * 懒加载并初始化 WASM 模块
 * 失败时清空缓存，下次调用会重新尝试
 */
async function loadWasmModule() {
    if (!wasmModulePromise) {
        wasmModulePromise = import('binance-orderbook-wasm')
            .then(async (module) => {
                // Use explicit wasm asset URL to avoid fragile relative lookup from Vite prebundle cache.
                await module.default(binanceOrderbookWasmUrl);
                return module;
            })
            .catch((error) => {
                wasmModulePromise = null; // 失败后允许重试
                throw error;
            });
    }
    return wasmModulePromise;
}

/**
 * 创建主线程 WASM 订单簿引擎
 * 失败时返回 null，调用方应降级为 JS 引擎
 * @param maxDepth 订单簿内部存储的最大档位数
 */
async function createWasmDepthStore(maxDepth: number): Promise<DepthStore | null> {
    try {
        const wasmModule = await loadWasmModule();
        const book = new wasmModule.OrderBook(maxDepth);

        return {
            async applySnapshot(snapshot) {
                book.apply_snapshot(snapshot);
            },
            async applyDelta(delta) {
                book.apply_delta(delta);
            },
            async getDepth(limit) {
                const rawDepth = book.get_depth(limit) as { bids?: unknown; asks?: unknown };
                return {
                    bids: normalizeNumericEntries(rawDepth?.bids),
                    asks: normalizeNumericEntries(rawDepth?.asks),
                };
            },
            destroy() {
                // 释放 WASM 分配的内存
                if (typeof book.free === 'function') {
                    book.free();
                }
            },
        };
    } catch (error) {
        console.warn('[useBinanceDepthStream] wasm init failed, fallback to JS engine.', error);
        return null;
    }
}

// ─── 引擎工厂：Worker + WASM ───────────────────────────────────────────────────

/**
 * 基于 Web Worker 的订单簿引擎
 *
 * 将 WASM 运算移至独立 Worker 线程，避免密集计算阻塞主线程渲染。
 * 内部使用请求队列（串行化）保证操作顺序，并通过 Promise 映射实现异步响应匹配。
 */
class WorkerDepthStore implements DepthStore {
    /** Worker 实例 */
    private readonly worker: Worker;

    /** 自增请求 ID，用于匹配请求与响应 */
    private requestId = 0;

    /** 串行化任务队列，保证 apply_snapshot → apply_delta 顺序正确 */
    private queue = Promise.resolve();

    /** 待响应的 Promise 映射表：requestId → { resolve, reject } */
    private readonly pending = new Map<
        number,
        {
            resolve: (value: unknown) => void;
            reject: (error: Error) => void;
        }
    >();

    /** Worker 就绪 Promise（等待 init 消息成功响应） */
    private readonly readyPromise: Promise<void>;

    /** Worker 消息事件处理器：根据 id 路由到对应的 pending Promise */
    private readonly onMessage = (event: MessageEvent<WorkerResponse>) => {
        const payload = event.data;
        const pending = this.pending.get(payload.id);
        if (!pending) {
            return;
        }
        this.pending.delete(payload.id);
        if (payload.ok) {
            pending.resolve(payload.data);
            return;
        }
        pending.reject(new Error(payload.error ?? 'Worker request failed.'));
    };

    /** Worker 错误事件处理器：拒绝所有待响应的 Promise */
    private readonly onError = () => {
        for (const pending of this.pending.values()) {
            pending.reject(new Error('Worker crashed.'));
        }
        this.pending.clear();
    };

    /**
     * @param maxDepth Worker 内订单簿存储的最大档位数
     * @param mode     Worker 内使用的引擎类型（'wasm' 或 'js'）
     */
    constructor(maxDepth: number, mode: 'wasm' | 'js') {
        this.worker = new Worker(new URL('../workers/orderBookWasm.worker.ts', import.meta.url), {
            type: 'module',
        });
        this.worker.addEventListener('message', this.onMessage);
        this.worker.addEventListener('error', this.onError);
        // 启动时立即发送 init，readyPromise 在 init 响应成功后 resolve
        this.readyPromise = this.enqueue(async () => {
            await this.request('init', { maxDepth, mode });
        });
    }

    /**
     * 将任务加入串行队列
     * 无论上一个任务是否失败，队列都会继续执行（catch 吞掉错误，由调用方处理）
     */
    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const next = this.queue.then(task, task);
        this.queue = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }

    /**
     * 向 Worker 发送请求并等待响应
     * @param type    请求类型
     * @param payload 附加参数
     */
    private request(type: WorkerRequestType, payload: Partial<WorkerRequest> = {}) {
        const id = ++this.requestId;
        const message: WorkerRequest = {
            id,
            type,
            ...payload,
        };

        return new Promise<unknown>((resolve, reject) => {
            this.pending.set(id, {
                resolve,
                reject: (error) => reject(error),
            });
            this.worker.postMessage(message);
        });
    }

    /** 等待 Worker 初始化完成 */
    async ready() {
        await this.readyPromise;
    }

    async applySnapshot(snapshot: DepthBookPayload) {
        await this.enqueue(async () => {
            await this.request('apply_snapshot', { snapshot });
        });
    }

    async applyDelta(delta: DepthBookPayload) {
        await this.enqueue(async () => {
            await this.request('apply_delta', { delta });
        });
    }

    async getDepth(limit: number) {
        const depth = await this.enqueue(async () => this.request('get_depth', { limit }));
        const payload = depth as { bids?: unknown; asks?: unknown };
        return {
            bids: normalizeNumericEntries(payload?.bids),
            asks: normalizeNumericEntries(payload?.asks),
        };
    }

    destroy() {
        this.worker.removeEventListener('message', this.onMessage);
        this.worker.removeEventListener('error', this.onError);
        // 通知 Worker 释放资源后终止
        void this.request('dispose').catch(() => undefined);
        this.worker.terminate();

        // 拒绝所有仍在等待的 Promise
        for (const pending of this.pending.values()) {
            pending.reject(new Error('Worker disposed.'));
        }
        this.pending.clear();
    }
}

/**
 * 创建 Worker + WASM 引擎
 * SSR 环境或不支持 Worker 时返回 null
 * Worker 初始化失败时返回 null，调用方应降级到主线程 WASM 引擎
 */
async function createWorkerDepthStore(maxDepth: number): Promise<DepthStore | null> {
    if (import.meta.server || typeof Worker === 'undefined') {
        return null;
    }

    let store: WorkerDepthStore | null = null;
    try {
        store = new WorkerDepthStore(maxDepth, 'wasm');
        await store.ready();
        return store;
    } catch (error) {
        store?.destroy();
        console.warn('[useBinanceDepthStream] worker wasm init failed, fallback to main thread.', error);
        return null;
    }
}

// ─── 主函数 ────────────────────────────────────────────────────────────────────

/**
 * 订阅 Binance 深度（盘口）流
 * @param options 配置项，可指定交易对、档位、速率、模式、引擎等
 * @returns bids、asks、isConnected、symbol、level、speed、mode、limit、engine、publishIntervalMs、diagnostics
 */
export function useBinanceDepthStream(options: UseBinanceDepthOptions = {}) {
    const runtimeEventStore = useRuntimeEventStore();
    /** 当前买盘快照（数字数组，降序排列） */
    const bids = shallowRef<BinanceDepthEntry[]>([]);
    /** 当前卖盘快照（数字数组，升序排列） */
    const asks = shallowRef<BinanceDepthEntry[]>([]);
    /** WebSocket 是否已成功连接 */
    const isConnected = shallowRef(false);

    // ── 以下变量仅在函数内部使用，不需要 shallowRef，用普通 let 节省解包开销 ──
    /** 当前 WebSocket 实例 */
    let socketRef: WebSocket | null = null,
        /** 本地订单簿的最新 lastUpdateId（diff 模式用于序列号对齐检查） */
        lastUpdateId: number | null = null,
        /** 等待快照加载期间缓冲的 diff 事件队列（不需要响应式） */
        pendingEvents: DepthDiffPayload[] = [],
        /** 是否正在加载快照（加载期间 diff 事件只缓冲不处理） */
        isBuffering = false,
        /** 当前引擎实例 */
        storeRef: DepthStore | null = null,
        /**
         * bootstrap 是否已被入队（防止 open 事件与首条 diff 消息重复触发 syncSnapshot）
         * open 事件入队后置为 true，resetBook 时归零
         */
        bootstrapEnqueued = false,
        /** Desktop Runtime 网关实例 */
        runtimeGateway: RuntimeGateway | null = null,
        /** Desktop Runtime 事件监听取消函数 */
        runtimeEventUnlisten: RuntimeUnlisten | null = null,
        /** Desktop Runtime 连接状态监听取消函数 */
        runtimeConnectionUnlisten: RuntimeUnlisten | null = null,
        /** 当前 Desktop Runtime 订阅 */
        activeRuntimeSubscription: RuntimeSubscription | null = null;

    // ─── 诊断计数器（仅用于调试，不影响业务逻辑） ───────────────────────────────
    /** 快照重载次数 */
    const snapshotReloadCount = shallowRef(0);
    /** 重同步次数 */
    const resyncCount = shallowRef(0);
    /** 被丢弃的事件总数 */
    const droppedEventCount = shallowRef(0);
    /** pending 队列历史峰值长度 */
    const pendingQueueHighWatermark = shallowRef(0);
    /** UI 发布次数 */
    const publishCount = shallowRef(0);
    /** 最近一次重同步的原因 */
    const lastResyncReason = shallowRef<ResyncReason | null>(null);

    // ─── 内部可变状态（不需要响应式，直接用 let） ────────────────────────────────
    // eslint-disable-next-line one-var
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null,
        /** 节流发布定时器 */
        publishTimer: ReturnType<typeof setTimeout> | null = null,
        /** 当前重连尝试次数 */
        reconnectAttempt = 0,
        /** 组件已销毁标记 */
        destroyed = false,
        /** 是否已从 SSR 注入的快照完成初始化 */
        hasSeededFromSSR = false,
        /** 引擎创建令牌，每次 disposeStore 时自增，防止过期回调写入新引擎 */
        storeCreateToken = 0,
        /** 当前引擎创建 Promise（防止重复并发创建） */
        storeCreatePromise: Promise<DepthStore | null> | null = null,
        /** 流会话 ID，切换交易对时自增，防止旧会话的异步任务影响新会话 */
        streamSession = 0,
        /** 串行化事件处理队列 */
        eventQueue: Promise<void> = Promise.resolve(),
        /** 当前正在执行的发布 Promise（防止并发发布） */
        publishInFlight: Promise<void> | null = null,
        /** 是否有新数据待发布（发布期间如有新数据需再次发布） */
        publishDirty = false,
        /** 上次发布的时间戳（ms），用于节流计算 */
        lastPublishAt = 0,
        /** 发布版本号，用于判断发布期间是否有新数据写入 */
        publishRevision = 0;

    // ─── 选项解析（响应式计算属性） ──────────────────────────────────────────────

    /** 解析 symbol 为小写字符串 */
    const resolvedSymbol = computed<string>(() => {
        const value = options.symbol ? toValue(options.symbol) : undefined;
        const normalized =
            typeof value === 'string' && value.length ? value : DEFAULT_SYMBOL;
        return normalized.toLowerCase();
    });

    /** 解析 symbol 为大写字符串（用于 REST 快照 URL） */
    const resolvedSymbolUpper = computed<string>(() => resolvedSymbol.value.toUpperCase());

    /** 解析 level，只允许 5 / 10 / 20，其余降级为 10 */
    const resolvedLevel = computed<BinanceDepthLevel>(() => {
        const source = options.level ?? DEFAULT_OPTIONS.level;
        const value = toValue(source);
        return value === 5 || value === 20 ? value : 10;
    });

    /** 解析 speed，只允许 '100ms' / '1000ms'，其余降级为 '100ms' */
    const resolvedSpeed = computed<BinanceDepthSpeed>(() => {
        const source = options.speed ?? DEFAULT_OPTIONS.speed;
        const value = toValue(source);
        return value === '1000ms' ? value : '100ms';
    });

    /** 解析 mode，只允许 'diff' / 'partial'，其余降级为 'diff' */
    const resolvedMode = computed<BinanceDepthMode>(() => {
        const source = options.mode ?? DEFAULT_OPTIONS.mode;
        return toValue(source) === 'partial' ? 'partial' : 'diff';
    });

    /**
     * Runtime fallback mode:
     * - keep requested mode by default
     * - when diff bootstrap snapshot cannot be loaded, downgrade to partial stream to keep orderbook visible
     */
    const forcePartialMode = shallowRef(false);
    const effectiveMode = computed<BinanceDepthMode>(() => (
        forcePartialMode.value ? 'partial' : resolvedMode.value
    ));

    function enablePartialFallback(reason: string) {
        if (resolvedMode.value !== 'diff' || forcePartialMode.value) {
            return;
        }
        forcePartialMode.value = true;
        console.warn(`[useBinanceDepthStream] switch to partial mode: ${reason}`);
    }

    /** 解析 limit，只允许枚举值，其余降级为 100 */
    const resolvedLimit = computed<BinanceDepthLimit>(() => {
        const source = options.limit ?? DEFAULT_OPTIONS.limit;
        const value = toValue(source);
        return value === 20 || value === 50 || value === 100 || value === 200 || value === 500 || value === 1000
            ? value
            : 100;
    });

    /** 解析 engine，只允许 'js' / 'wasm' / 'wasm-worker'，其余降级为 'wasm' */
    const resolvedEngine = computed<BinanceDepthEngine>(() => {
        const source = options.engine ?? DEFAULT_OPTIONS.engine;
        const value = toValue(source);
        if (value === 'js' || value === 'wasm-worker') {
            return value;
        }
        return 'wasm';
    });

    /** 解析 publishIntervalMs，必须为有限非负整数，其余降级为默认值 */
    const resolvedPublishIntervalMs = computed<number>(() => {
        const source = options.publishIntervalMs ?? DEFAULT_OPTIONS.publishIntervalMs;
        const value = Number(toValue(source));
        if (!Number.isFinite(value)) {
            return DEFAULT_OPTIONS.publishIntervalMs;
        }
        return Math.max(0, Math.floor(value));
    });

    // ─── 派生 URL ────────────────────────────────────────────────────────────────

    /**
     * WebSocket 流订阅 key
     * - partial 模式：`<symbol>@depth<level>@<speed>`
     * - diff 模式：`<symbol>@depth@<speed>`
     */
    const streamKey = computed(() =>
        effectiveMode.value === 'partial'
            ? `${resolvedSymbol.value}@depth${resolvedLevel.value}@${resolvedSpeed.value}`
            : `${resolvedSymbol.value}@depth@${resolvedSpeed.value}`,
    );
    /**
     * 默认 WebSocket 连接地址（用于 watch 依赖触发）
     * 真实连接会通过 buildStreamUrl 按重试次数轮询候选域名。
     */
    const streamUrl = computed(() => `${BINANCE_STREAM_BASE_URLS[0]}/${streamKey.value}`);

    function buildStreamUrl(attempt = 0) {
        const safeAttempt = Number.isFinite(attempt) && attempt >= 0 ? Math.floor(attempt) : 0;
        const baseUrl = BINANCE_STREAM_BASE_URLS[safeAttempt % BINANCE_STREAM_BASE_URLS.length]!;
        return `${baseUrl}/${streamKey.value}`;
    }
    /** REST 快照请求路径（不含域名，用于候选域名 failover） */
    const snapshotPath = computed(
        () => `/api/v3/depth?symbol=${resolvedSymbolUpper.value}&limit=${resolvedLimit.value}`,
    );

    // ─── SSR 快照注入 ─────────────────────────────────────────────────────────────

    /**
     * SSR 快照的 Nuxt 跨端状态（useState）
     * key 包含 symbol 和 limit，保证不同交易对不互相污染
     */
    const ssrSnapshotState = useState<DepthSnapshotPayload | null>(
        `binance-depth-snapshot:${resolvedSymbolUpper.value}:${resolvedLimit.value}`,
        () => null,
    );

    // 水合阶段：若 SSR 已注入快照，先同步写入响应式状态（无需等待引擎）
    const serializedSnapshot = sanitizeSnapshotPayload(ssrSnapshotState.value);
    if (serializedSnapshot) {
        bids.value = normalizeNumericEntries(serializedSnapshot.bids);
        asks.value = normalizeNumericEntries(serializedSnapshot.asks);
        ({ lastUpdateId } = serializedSnapshot);
    }

    // ─── 引擎管理 ─────────────────────────────────────────────────────────────────

    /**
     * 销毁当前引擎实例
     * 自增 token 使任何正在进行中的引擎创建 Promise 作废
     */
    function disposeStore() {
        storeCreateToken += 1;
        storeRef?.destroy();
        storeRef = null;
        storeCreatePromise = null;
    }

    /**
     * 根据 resolvedEngine 创建对应引擎
     * 降级顺序：wasm-worker → wasm → js
     */
    async function createStore(maxDepth: number) {
        if (import.meta.server || resolvedEngine.value === 'js') {
            return createJsDepthStore();
        }

        if (resolvedEngine.value === 'wasm-worker') {
            const workerStore = await createWorkerDepthStore(maxDepth);
            if (workerStore) {
                return workerStore;
            }
        }

        // wasm-worker 失败或选择 wasm 时，尝试主线程 WASM
        const wasmStore = await createWasmDepthStore(maxDepth);
        if (wasmStore) {
            return wasmStore;
        }

        // 最终降级到纯 JS 引擎
        return createJsDepthStore();
    }

    /**
     * 懒初始化引擎（单例模式）
     * - 若引擎已存在直接返回
     * - 若正在创建中，等待同一个 Promise
     * - 若 token 在创建过程中变更（disposeStore 被调用），放弃此次创建
     */
    async function ensureStore() {
        if (storeRef) {
            return storeRef;
        }

        if (storeCreatePromise) {
            return storeCreatePromise;
        }

        const currentToken = storeCreateToken;
        storeCreatePromise = (async () => {
            const nextStore = await createStore(Math.max(MIN_STORE_DEPTH, resolvedLimit.value));
            if (currentToken !== storeCreateToken) {
                // token 已变更，说明 disposeStore 在创建过程中被调用，丢弃此引擎
                nextStore.destroy();
                return null;
            }
            storeRef = nextStore;
            return nextStore;
        })();

        const store = await storeCreatePromise;
        if (currentToken === storeCreateToken) {
            storeCreatePromise = null;
        }
        return store;
    }

    // ─── 节流发布 ─────────────────────────────────────────────────────────────────

    /** 清除发布节流定时器 */
    function clearPublishTimer() {
        if (publishTimer !== null) {
            clearTimeout(publishTimer);
            publishTimer = null;
        }
    }

    /**
     * 立即从引擎读取最新深度并发布到 Vue 响应式状态
     * @param targetRevision 发布时的目标版本号，用于判断发布后是否需要再次发布
     */
    async function publishDepthNow(targetRevision: number) {
        const sessionAtStart = streamSession;
        const store = await ensureStore();
        // 会话切换后放弃发布（旧会话数据不应写入新会话）
        if (!store || sessionAtStart !== streamSession) {
            return;
        }

        const depth = await store.getDepth(resolvedLimit.value);
        if (sessionAtStart !== streamSession) {
            return;
        }

        // 这里必须用“替换引用”的发布策略：
        // spot 订单簿子组件通过 props 依赖数组引用变化，原地修改会导致子组件计算属性不稳定。
        const bidChanged = hasDepthEntriesChanged(bids.value, depth.bids);
        const askChanged = hasDepthEntriesChanged(asks.value, depth.asks);

        if (bidChanged) {
            bids.value = depth.bids;
        }
        if (askChanged) {
            asks.value = depth.asks;
        }
        if (bidChanged || askChanged) {
            publishCount.value += 1;
        }
        lastPublishAt = Date.now();

        // 只有当期间没有新的 delta 要发布时，才清掉 dirty 标记。
        if (targetRevision === publishRevision) {
            publishDirty = false;
        }
    }

    /**
     * 执行一次发布任务
     * 若上一次发布尚未完成（publishInFlight），直接复用同一 Promise
     * 发布完成后，若 publishDirty 为 true，自动安排下一次发布
     */
    function runPublish() {
        if (publishInFlight) {
            return publishInFlight;
        }

        publishInFlight = publishDepthNow(publishRevision)
            .catch((error) => {
                console.error('[useBinanceDepthStream] publish depth failed.', error);
            })
            .finally(() => {
                publishInFlight = null;
                // 发布期间如果又累积了新数据，再安排下一次发布。
                if (publishDirty && !destroyed) {
                    void schedulePublish();
                }
            });

        return publishInFlight;
    }

    /**
     * 安排一次节流发布
     * - forceImmediate = true 时立即发布（如快照写入后的首帧）
     * - 否则按 publishIntervalMs 计算距上次发布的剩余时间，到时再发布
     */
    function schedulePublish(forceImmediate = false) {
        publishDirty = true;
        publishRevision += 1;

        if (forceImmediate || resolvedPublishIntervalMs.value <= 0) {
            clearPublishTimer();
            return runPublish();
        }

        const elapsed = Date.now() - lastPublishAt;
        const delay = Math.max(0, resolvedPublishIntervalMs.value - elapsed);

        // 已有定时器在等待，无需重复安排
        if (publishTimer !== null) {
            return Promise.resolve();
        }

        if (delay === 0) {
            return runPublish();
        }

        publishTimer = setTimeout(() => {
            publishTimer = null;
            void runPublish();
        }, delay);
        return Promise.resolve();
    }

    // ─── 快照 & Delta 应用 ────────────────────────────────────────────────────────

    /**
     * 将快照写入引擎并立即发布一次（首帧与重同步后调用）
     * @param snapshot  快照数据
     * @param updateId  快照对应的 lastUpdateId
     */
    async function applySnapshot(snapshot: DepthSnapshotPayload, updateId: number | null) {
        const store = await ensureStore();
        if (!store) {
            return;
        }
        await store.applySnapshot({
            bids: snapshot.bids,
            asks: snapshot.asks,
        });
        lastUpdateId = updateId;
        // 快照写入后立即发布，保证首帧和重同步后的 UI 一致。
        await schedulePublish(true);
    }

    /**
     * 将增量 delta 写入引擎并安排节流发布
     * @param delta 增量数据
     */
    async function applyDelta(delta: DepthBookPayload) {
        const store = await ensureStore();
        if (!store) {
            return;
        }
        await store.applyDelta(delta);
        // delta 只更新引擎，UI 发布交给调度器做节流。
        await schedulePublish(false);
    }

    // ─── REST 快照拉取 ────────────────────────────────────────────────────────────

    /**
     * 通过 fetch 拉取 Binance REST 快照
     * 网络异常或响应格式异常时返回 null
     */
    async function fetchSnapshot() {
        const errors: string[] = [];
        try {
            for (const baseUrl of BINANCE_DEPTH_REST_BASES) {
                const requestUrl = `${baseUrl}${snapshotPath.value}`;
                try {
                    const response = await fetch(requestUrl);
                    if (!response.ok) {
                        errors.push(`${baseUrl} status=${response.status}`);
                        continue;
                    }

                    const payload = await response.json();
                    const normalized: DepthSnapshotPayload = {
                        bids: normalizeWireEntries(payload?.bids),
                        asks: normalizeWireEntries(payload?.asks),
                        lastUpdateId: typeof payload?.lastUpdateId === 'number' ? payload.lastUpdateId : null,
                    };
                    if (normalized.lastUpdateId === null) {
                        errors.push(`${baseUrl} payload missing lastUpdateId`);
                        continue;
                    }
                    return normalized;
                } catch (innerError) {
                    errors.push(`${baseUrl} ${innerError instanceof Error ? innerError.message : String(innerError)}`);
                }
            }

            enablePartialFallback(`snapshot unavailable across hosts: ${errors.join(' | ')}`);
            return null;
        } catch (error) {
            console.warn('[useBinanceDepthStream] failed to fetch snapshot.', error);
            enablePartialFallback('snapshot fetch exception');
            return null;
        }
    }

    // ─── 订单簿重置 ───────────────────────────────────────────────────────────────

    /**
     * 完全重置订单簿状态
     * 自增 streamSession 使所有正在进行中的异步任务感知到会话切换并退出
     */
    function resetBook() {
        streamSession += 1;
        bids.value = [];
        asks.value = [];
        lastUpdateId = null;
        pendingEvents = [];
        isBuffering = false;
        bootstrapEnqueued = false;
        publishDirty = false;
        publishInFlight = null;
        lastPublishAt = 0;
        clearPublishTimer();
        disposeStore();
    }

    // ─── SSR 种子初始化 ───────────────────────────────────────────────────────────

    /**
     * 从 SSR 注入的快照初始化引擎（仅执行一次）
     * 客户端水合阶段调用，避免 WebSocket 连接后重复拉取 REST 快照
     */
    async function seedFromSSR() {
        if (hasSeededFromSSR) {
            return;
        }

        const snapshot = sanitizeSnapshotPayload(ssrSnapshotState.value);
        if (!snapshot) {
            return;
        }

        hasSeededFromSSR = true;
        await applySnapshot(snapshot, snapshot.lastUpdateId);
    }

    // ─── 快照重载 ─────────────────────────────────────────────────────────────────

    /**
     * 通过 REST 拉取最新快照并写入引擎
     * @param preservePending 是否保留 pending 事件队列（false 时直接丢弃）
     */
    async function loadSnapshot(preservePending = false) {
        isBuffering = true;
        if (!preservePending) {
            // 丢弃所有缓冲事件，避免旧数据污染新快照
            droppedEventCount.value += pendingEvents.length;
            pendingEvents = [];
        }

        try {
            const snapshot = await fetchSnapshot();
            // 注意：无论快照是否拉取成功，finally 都必须清掉 isBuffering。
            // 不要在 try 块内提前 return，否则 isBuffering 会永久卡在 true。
            if (snapshot) {
                snapshotReloadCount.value += 1;
                await applySnapshot(snapshot, snapshot.lastUpdateId);
            }
        } finally {
            isBuffering = false;
        }
    }

    // ─── pending 事件队列管理 ─────────────────────────────────────────────────────

    /**
     * 向 pending 队列追加一个 diff 事件
     * 超过 MAX_PENDING_EVENTS 时丢弃整个队列并返回 false（触发重同步）
     * @returns 是否成功追加（false 表示队列溢出）
     */
    function appendPendingEvent(payload: DepthDiffPayload) {
        pendingEvents.push(payload);
        const size = pendingEvents.length;
        if (size > pendingQueueHighWatermark.value) {
            pendingQueueHighWatermark.value = size;
        }
        if (size <= MAX_PENDING_EVENTS) {
            return true;
        }

        // 超过上限后直接丢弃队列并走重同步，避免积压导致的脏数据。
        droppedEventCount.value += size;
        pendingEvents = [];
        return false;
    }

    /**
     * 按 updateId 顺序消费 pending 队列中的所有 diff 事件
     * 若发现序列号 gap，立即触发重同步并终止本次 flush
     */
    async function flushPendingEvents() {
        if (lastUpdateId === null) {
            return;
        }

        // 按 endUpdateId 升序排序后消费
        const events = pendingEvents.sort((a: DepthDiffPayload, b: DepthDiffPayload) => (a?.u ?? 0) - (b?.u ?? 0));
        pendingEvents = [];

        // 在循环外缓存 lastUpdateId，避免每次迭代都触发闭包读取；
        // 循环内用 localUpdateId 推进，结束后同步回全局变量。
        let localUpdateId = lastUpdateId;

        for (const payload of events) {
            const startUpdate = payload?.U;
            const endUpdate = payload?.u;
            if (typeof startUpdate !== 'number' || typeof endUpdate !== 'number') {
                continue;
            }

            // 此事件已被快照覆盖，跳过
            if (endUpdate <= localUpdateId) {
                continue;
            }

            // 序列号不连续：检测到 gap，立即重同步
            if (startUpdate > localUpdateId + 1) {
                lastUpdateId = localUpdateId; // 先同步回去，再进重同步
                await syncSnapshot(false, 'gap');
                return;
            }

            // 正常增量：应用并推进 localUpdateId
            const bidUpdates = normalizeWireEntries(payload?.b);
            const askUpdates = normalizeWireEntries(payload?.a);
            await applyDelta({
                bids: bidUpdates,
                asks: askUpdates,
            });
            localUpdateId = endUpdate;
        }

        // 将最终推进的 updateId 同步回全局
        lastUpdateId = localUpdateId;
    }

    // ─── 重同步 ───────────────────────────────────────────────────────────────────

    /**
     * 重新加载快照并重放 pending 事件（完整重同步流程）
     * @param preservePending 是否保留现有 pending 事件
     * @param reason          重同步原因（用于诊断）
     */
    async function syncSnapshot(preservePending = false, reason?: ResyncReason) {
        if (reason) {
            resyncCount.value += 1;
            lastResyncReason.value = reason;
        }
        await loadSnapshot(preservePending);
        await flushPendingEvents();
    }

    // ─── WebSocket 消息处理 ───────────────────────────────────────────────────────

    /**
     * 处理 partial 模式的消息
     * 每条消息即为完整局部快照，直接覆盖引擎数据
     */
    async function handlePartialPayload(payload: DepthDiffPayload) {
        // partial 模式支持 bids/asks 和 b/a 两种字段命名
        const nextBids = normalizeWireEntries(payload?.bids ?? payload?.b ?? []);
        const nextAsks = normalizeWireEntries(payload?.asks ?? payload?.a ?? []);

        await applySnapshot(
            {
                bids: nextBids,
                asks: nextAsks,
                lastUpdateId: null,
            },
            null,
        );
    }

    /**
     * 处理 diff 模式的单条增量消息
     * 遵循 Binance 官方对齐规则：
     * 1. 快照加载中（isBuffering）或尚无 lastUpdateId → 缓冲事件，首次还会触发 bootstrap 重同步
     * 2. endUpdate <= lastUpdateId → 过期事件，直接忽略
     * 3. startUpdate > lastUpdateId + 1 → gap，触发重同步
     * 4. 正常连续事件 → 应用 delta 并更新 lastUpdateId
     */
    async function processDiffPayload(payload: DepthDiffPayload) {
        const updateId = lastUpdateId;
        if (updateId === null || isBuffering) {
            // 尚无快照：缓冲事件
            if (!appendPendingEvent(payload)) {
                // 队列溢出：触发重同步
                await syncSnapshot(false, 'pending-overflow');
                return;
            }
            // 首次连接：仅在 open 事件尚未入队 bootstrap 时才触发（防止双重 bootstrap）
            if (updateId === null && !isBuffering && !bootstrapEnqueued) {
                bootstrapEnqueued = true;
                await syncSnapshot(true, 'bootstrap');
            }
            return;
        }

        const startUpdate = payload?.U;
        const endUpdate = payload?.u;
        if (typeof startUpdate !== 'number' || typeof endUpdate !== 'number') {
            return;
        }

        // 过期事件：已被快照覆盖，忽略
        if (endUpdate <= updateId) {
            return;
        }

        // Binance 对齐规则：只接受与 currentUpdateId 连续衔接的 diff。
        if (startUpdate > updateId + 1) {
            await syncSnapshot(false, 'gap');
            return;
        }

        // 正常增量：应用并推进 lastUpdateId
        const bidUpdates = normalizeWireEntries(payload?.b);
        const askUpdates = normalizeWireEntries(payload?.a);
        await applyDelta({
            bids: bidUpdates,
            asks: askUpdates,
        });
        lastUpdateId = endUpdate;
    }

    // ─── 串行化事件队列 ───────────────────────────────────────────────────────────

    /**
     * 将异步任务加入串行化队列
     * 会话切换后，旧会话的任务会感知到 sessionAtEnqueue !== streamSession 而跳过执行
     */
    function enqueueEvent(task: () => Promise<void>) {
        const sessionAtEnqueue = streamSession;
        eventQueue = eventQueue.then(async () => {
            // 会话切换后跳过旧会话的任务
            if (sessionAtEnqueue !== streamSession) {
                return;
            }
            await task();
        }).catch((error) => {
            console.error('[useBinanceDepthStream] event processing failed.', error);
        });
        return eventQueue;
    }

    // ─── WebSocket 连接管理 ───────────────────────────────────────────────────────

    /** 断开当前 WebSocket 并清除所有定时器 */
    function disconnect() {
        if (reconnectTimer !== null) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        clearPublishTimer();
        socketRef?.close();
        socketRef = null;
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

            if (event.channel !== 'market.depth.delta') {
                return;
            }

            const { payload } = event;
            if (!payload || typeof payload !== 'object') {
                return;
            }

            const depthPayload = payload as DepthDiffPayload;
            void enqueueEvent(async () => {
                if (effectiveMode.value === 'partial') {
                    await handlePartialPayload(depthPayload);
                } else {
                    await processDiffPayload(depthPayload);
                }
            });
        });

        runtimeConnectionUnlisten = gateway.onConnectionState((event) => {
            runtimeEventStore.dispatchConnectionState(event);
            const wasConnected = isConnected.value;
            const nextConnected = event.state === 'ready';
            isConnected.value = nextConnected;

            if (
                !wasConnected
                && nextConnected
                && event.source === 'rust-runtime'
                && effectiveMode.value === 'diff'
            ) {
                bootstrapEnqueued = true;
                void enqueueEvent(async () => {
                    await syncSnapshot(false, 'bootstrap');
                });
            }
        });

        await gateway.connect();

        const runtimeSubscription: RuntimeSubscription = {
            channel: 'market.depth.delta',
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
     * - open：diff 模式下立即触发 bootstrap 重同步
     * - message：根据模式分发到 handlePartialPayload 或 processDiffPayload
     * - close：安排重连
     * - error：关闭连接（由 close 事件触发重连）
     */
    function connectTo(url: string) {
        // SSR 环境或连接已存在时，跳过
        if (import.meta.server || socketRef) return;

        const socket = new WebSocket(url);
        socketRef = socket;

        socket.addEventListener('open', () => {
            reconnectAttempt = 0;
            isConnected.value = true;
            runtimeEventStore.dispatchConnectionState({
                state: 'ready',
                source: 'websocket',
                timestamp: Date.now(),
            });
            // diff 模式连接后立即拉快照并初始化订单簿；
            // 设置 bootstrapEnqueued 防止首条 diff 消息再次触发 bootstrap。
            if (effectiveMode.value === 'diff') {
                bootstrapEnqueued = true;
                void enqueueEvent(async () => {
                    await syncSnapshot(false, 'bootstrap');
                });
            }
        });

        socket.addEventListener('message', (event) => {
            let payload: DepthDiffPayload;
            try {
                payload = JSON.parse(event.data) as DepthDiffPayload;
            } catch (error) {
                console.warn('[useBinanceDepthStream] invalid ws payload.', error);
                return;
            }
            // 所有消息通过串行化队列处理，保证顺序
            void enqueueEvent(async () => {
                runtimeEventStore.dispatchRuntimeEvent({
                    type: 'runtime.event',
                    channel: 'market.depth.delta',
                    timestamp: Date.now(),
                    payload,
                    sequence: typeof payload?.u === 'number' ? payload.u : undefined,
                    source: 'websocket',
                });
                if (effectiveMode.value === 'partial') {
                    await handlePartialPayload(payload);
                } else {
                    await processDiffPayload(payload);
                }
            });
        });

        socket.addEventListener('close', () => {
            isConnected.value = false;
            socketRef = null;
            runtimeEventStore.dispatchConnectionState({
                state: 'reconnecting',
                source: 'websocket',
                timestamp: Date.now(),
            });
            scheduleReconnect();
        });

        socket.addEventListener('error', () => {
            socket.close();
        });
    }

    // ─── SSR 预取 ─────────────────────────────────────────────────────────────────

    if (import.meta.server) {
        // 服务端预取：拉取快照注入 useState，供客户端水合时读取
        onServerPrefetch(async () => {
            try {
                const snapshot = await fetchSnapshot();
                if (!snapshot) {
                    return;
                }
                ssrSnapshotState.value = snapshot;
                await applySnapshot(snapshot, snapshot.lastUpdateId);
                hasSeededFromSSR = true;
            } catch (error) {
                // SSR should never fail the whole page because market data source is unstable.
                console.warn('[useBinanceDepthStream] SSR prefetch skipped due error.', error);
            }
        });
    }

    // ─── 客户端初始化与 watch ─────────────────────────────────────────────────────

    if (import.meta.client) {
        // 监听 streamUrl、snapshotPath、resolvedEngine 的变化（任一变化时重置并重连）
        watch(
            [streamUrl, snapshotPath, resolvedEngine, resolvedMode],
            () => {
                destroyed = false;
                reconnectAttempt = 0;
                disconnect();
                resetBook();

                // 若 SSR 已注入快照且尚未消费，先同步写入响应式状态以避免首帧白屏
                const snapshot = sanitizeSnapshotPayload(ssrSnapshotState.value);
                if (snapshot && !hasSeededFromSSR) {
                    bids.value = normalizeNumericEntries(snapshot.bids);
                    asks.value = normalizeNumericEntries(snapshot.asks);
                    ({ lastUpdateId } = snapshot);
                }

                // 从 SSR 快照初始化引擎（仅首次执行）
                void enqueueEvent(async () => {
                    await seedFromSSR();
                    // partial 模式下若没有 SSR 快照，主动拉一次 REST 快照作为首帧兜底。
                    if (!hasSeededFromSSR && effectiveMode.value === 'partial') {
                        await loadSnapshot(false);
                    }
                });

                if (isDesktopRuntime()) {
                    void connectDesktopRuntime();
                    return;
                }

                connectTo(buildStreamUrl(reconnectAttempt));
            },
            { immediate: true },
        );
    }

    // ─── 生命周期清理 ─────────────────────────────────────────────────────────────

    // 组件卸载前清理所有资源：WebSocket、定时器、引擎
    onBeforeUnmount(() => {
        destroyed = true;
        disconnect();
        resetBook();
    });

    // ─── 返回值 ───────────────────────────────────────────────────────────────────

    return {
        /** 当前买盘（响应式，降序排列） */
        bids,
        /** 当前卖盘（响应式，升序排列） */
        asks,
        /** WebSocket 连接状态（响应式） */
        isConnected,
        /** 当前交易对符号，小写（响应式） */
        symbol: resolvedSymbol,
        /** 局部快照档位数（响应式） */
        level: resolvedLevel,
        /** WebSocket 推送速率（响应式） */
        speed: resolvedSpeed,
        /** 深度流模式（响应式） */
        mode: effectiveMode,
        /** REST 快照档位数（响应式） */
        limit: resolvedLimit,
        /** 订单簿后端引擎（响应式） */
        engine: resolvedEngine,
        /** UI 发布节流间隔（响应式） */
        publishIntervalMs: resolvedPublishIntervalMs,
        /** 诊断信息（仅用于调试） */
        diagnostics: {
            /** 快照重载次数 */
            snapshotReloadCount,
            /** 重同步次数 */
            resyncCount,
            /** 被丢弃的事件总数 */
            droppedEventCount,
            /** pending 队列历史峰值 */
            pendingQueueHighWatermark,
            /** UI 发布次数 */
            publishCount,
            /** 最近一次重同步原因 */
            lastResyncReason,
        },
    };
}
