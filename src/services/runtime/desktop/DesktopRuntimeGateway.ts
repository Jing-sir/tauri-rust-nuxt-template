import { isDesktopRuntime } from '../environment';
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

const CONNECTION_EVENT = 'runtime.connection.state';
const RUNTIME_EVENT = 'runtime.event';

type DesktopConnectionPayload = {
    state: RuntimeConnectionState;
    source?: string;
    timestamp?: number;
};

const isConnectionPayload = (value: unknown): value is DesktopConnectionPayload => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const payload = value as Record<string, unknown>;
    return typeof payload.state === 'string';
};

export class DesktopRuntimeGateway implements RuntimeGateway {
    private readonly subscriptions = new Map<string, RuntimeSubscription>();
    private readonly eventHandlers = new Set<RuntimeEventHandler>();
    private readonly connectionHandlers = new Set<RuntimeConnectionStateHandler>();
    private readonly unlistenTasks = new Set<RuntimeUnlisten>();
    private initialized = false;

    async connect() {
        if (import.meta.server) {
            return;
        }

        if (!isDesktopRuntime()) {
            this.emitConnectionState('offline');
            return;
        }

        await this.initListeners();
        await this.tryInvoke('ping_rust', { name: 'runtime-gateway' });
        await this.replaySubscriptions();
        await this.tryInvoke('emit_runtime_state', { state: 'ready' });
        this.emitConnectionState('ready');
    }

    async disconnect() {
        await this.tryInvoke('runtime_disconnect_all', {});
        await this.disposeListeners();
        this.emitConnectionState('offline');
    }

    async subscribe(subscription: RuntimeSubscription) {
        const key = this.subscriptionKey(subscription);
        this.subscriptions.set(key, subscription);

        await this.tryInvoke('runtime_subscribe', {
            subscription,
        });
    }

    async unsubscribe(subscription: RuntimeSubscription) {
        const key = this.subscriptionKey(subscription);
        this.subscriptions.delete(key);

        await this.tryInvoke('runtime_unsubscribe', {
            subscription,
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

    private async initListeners() {
        if (this.initialized) {
            return;
        }

        const { listen } = await import('@tauri-apps/api/event');

        const unlistenConnection = await listen<DesktopConnectionPayload>(
            CONNECTION_EVENT,
            ({ payload }) => {
                if (!isConnectionPayload(payload)) {
                    return;
                }

                this.emitConnectionState(payload.state, payload.source, payload.timestamp);
            }
        );

        const unlistenRuntimeEvent = await listen<RuntimeEvent>(RUNTIME_EVENT, ({ payload }) => {
            if (!payload || payload.type !== 'runtime.event') {
                return;
            }

            this.emitRuntimeEvent({
                ...payload,
                source: payload.source ?? 'rust-runtime',
                timestamp: payload.timestamp ?? Date.now(),
            });
        });

        this.unlistenTasks.add(unlistenConnection);
        this.unlistenTasks.add(unlistenRuntimeEvent);
        this.initialized = true;
    }

    private async disposeListeners() {
        for (const unlisten of this.unlistenTasks) {
            await unlisten();
        }

        this.unlistenTasks.clear();
        this.initialized = false;
    }

    private emitRuntimeEvent(event: RuntimeEvent) {
        this.eventHandlers.forEach((handler) => {
            void handler(event);
        });
    }

    private emitConnectionState(
        state: RuntimeConnectionState,
        source?: string,
        timestamp?: number
    ) {
        const event: RuntimeConnectionStateEvent = {
            state,
            source: source === 'rust-runtime' ? 'rust-runtime' : 'unknown',
            timestamp: timestamp ?? Date.now(),
        };

        this.connectionHandlers.forEach((handler) => {
            void handler(event);
        });
    }

    private subscriptionKey(subscription: RuntimeSubscription) {
        return `${subscription.channel}:${subscription.topic ?? ''}:${JSON.stringify(subscription.params ?? {})}`;
    }

    private async replaySubscriptions() {
        const entries = Array.from(this.subscriptions.values());
        for (const subscription of entries) {
            await this.tryInvoke('runtime_subscribe', {
                subscription,
            });
        }
    }

    private async tryInvoke<T = unknown>(command: string, args: Record<string, unknown>) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            return await invoke<T>(command, args);
        } catch {
            return undefined;
        }
    }
}
