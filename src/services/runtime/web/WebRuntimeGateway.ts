import type {
    RuntimeConnectionState,
    RuntimeConnectionStateEvent,
    RuntimeConnectionStateHandler,
    RuntimeEvent,
    RuntimeEventHandler,
    RuntimeGateway,
    RuntimeSubscription,
    RuntimeUnlisten,
} from '../types';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 800;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 20_000;

const subscriptionKey = (subscription: RuntimeSubscription) =>
    `${subscription.channel}:${subscription.topic ?? ''}:${JSON.stringify(subscription.params ?? {})}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const toSequence = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const normalizeChannel = (payload: Record<string, unknown>) => {
    if (typeof payload.channel === 'string') return payload.channel;
    if (typeof payload.topic === 'string') return payload.topic;
    return 'runtime.event';
};

export interface WebRuntimeGatewayOptions {
    url: string;
    heartbeatIntervalMs?: number;
    reconnectBaseDelayMs?: number;
    reconnectMaxDelayMs?: number;
    parseMessage?: (payload: unknown) => RuntimeEvent | RuntimeEvent[] | null;
}

export class WebRuntimeGateway implements RuntimeGateway {
    private socket: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectAttempt = 0;
    private shouldReconnect = false;
    private readonly subscriptions = new Map<string, RuntimeSubscription>();
    private readonly eventHandlers = new Set<RuntimeEventHandler>();
    private readonly connectionHandlers = new Set<RuntimeConnectionStateHandler>();

    constructor(private readonly options: WebRuntimeGatewayOptions) {}

    async connect() {
        if (import.meta.server || this.socket) {
            return;
        }

        this.shouldReconnect = true;
        this.emitConnectionState('connecting');
        this.openSocket();
    }

    async disconnect() {
        this.shouldReconnect = false;
        this.clearReconnectTimer();
        this.clearHeartbeatTimer();

        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        this.emitConnectionState('offline');
    }

    async subscribe(subscription: RuntimeSubscription) {
        const key = subscriptionKey(subscription);
        this.subscriptions.set(key, subscription);
        this.sendJson({
            op: 'subscribe',
            ...subscription,
        });
    }

    async unsubscribe(subscription: RuntimeSubscription) {
        const key = subscriptionKey(subscription);
        this.subscriptions.delete(key);
        this.sendJson({
            op: 'unsubscribe',
            ...subscription,
        });
    }

    onEvent(handler: RuntimeEventHandler): RuntimeUnlisten {
        this.eventHandlers.add(handler);
        return () => {
            this.eventHandlers.delete(handler);
        };
    }

    onConnectionState(handler: RuntimeConnectionStateHandler): RuntimeUnlisten {
        this.connectionHandlers.add(handler);
        return () => {
            this.connectionHandlers.delete(handler);
        };
    }

    private openSocket() {
        if (import.meta.server || this.socket) {
            return;
        }

        const socket = new WebSocket(this.options.url);
        this.socket = socket;

        socket.addEventListener('open', () => {
            this.reconnectAttempt = 0;
            this.emitConnectionState('ready');
            this.startHeartbeat();
            this.resubscribeAll();
        });

        socket.addEventListener('message', (event) => {
            this.handleIncomingMessage(event.data);
        });

        socket.addEventListener('close', () => {
            this.clearHeartbeatTimer();
            this.socket = null;

            if (!this.shouldReconnect) {
                this.emitConnectionState('offline');
                return;
            }

            this.emitConnectionState('reconnecting');
            this.scheduleReconnect();
        });

        socket.addEventListener('error', () => {
            socket.close();
        });
    }

    private scheduleReconnect() {
        if (!this.shouldReconnect) {
            return;
        }

        this.clearReconnectTimer();
        const baseDelay = this.options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
        const maxDelay = this.options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
        const delay = Math.min(baseDelay * 2 ** this.reconnectAttempt, maxDelay);
        this.reconnectAttempt++;

        this.reconnectTimer = setTimeout(() => {
            this.openSocket();
        }, delay);
    }

    private clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private startHeartbeat() {
        this.clearHeartbeatTimer();
        const interval = this.options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
        this.heartbeatTimer = setInterval(() => {
            this.sendJson({
                op: 'ping',
                timestamp: Date.now(),
            });
        }, interval);
    }

    private clearHeartbeatTimer() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private sendJson(payload: Record<string, unknown>) {
        if (this.socket?.readyState !== WebSocket.OPEN) {
            return;
        }

        this.socket.send(JSON.stringify(payload));
    }

    private resubscribeAll() {
        this.subscriptions.forEach((subscription) => {
            this.sendJson({
                op: 'subscribe',
                ...subscription,
            });
        });
    }

    private handleIncomingMessage(data: unknown) {
        let parsed: unknown = data;

        if (typeof data === 'string') {
            try {
                parsed = JSON.parse(data);
            } catch {
                return;
            }
        }

        const mappedEvents = this.mapRuntimeEvents(parsed);
        if (!mappedEvents) {
            return;
        }

        const eventList = Array.isArray(mappedEvents) ? mappedEvents : [mappedEvents];
        for (const event of eventList) {
            this.emitRuntimeEvent(event);
        }
    }

    private mapRuntimeEvents(payload: unknown) {
        if (this.options.parseMessage) {
            return this.options.parseMessage(payload);
        }

        if (!isRecord(payload)) {
            return null;
        }

        if (payload.e === 'depthUpdate') {
            return this.createRuntimeEvent('market.depth.delta', payload);
        }

        if (payload.e === 'trade' || payload.e === 'aggTrade') {
            return this.createRuntimeEvent('market.trade.tick', payload);
        }

        return this.createRuntimeEvent(normalizeChannel(payload), payload);
    }

    private createRuntimeEvent(channel: string, payload: Record<string, unknown>): RuntimeEvent {
        return {
            type: 'runtime.event',
            channel,
            timestamp: Date.now(),
            payload,
            sequence: toSequence(payload.sequence ?? payload.u ?? payload.E),
            source: 'websocket',
        };
    }

    private emitRuntimeEvent(event: RuntimeEvent) {
        this.eventHandlers.forEach((handler) => {
            void handler(event);
        });
    }

    private emitConnectionState(state: RuntimeConnectionState) {
        const event: RuntimeConnectionStateEvent = {
            state,
            source: 'websocket',
            timestamp: Date.now(),
        };

        this.connectionHandlers.forEach((handler) => {
            void handler(event);
        });
    }
}
