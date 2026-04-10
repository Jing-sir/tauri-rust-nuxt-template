export type RuntimeConnectionState =
    | 'connecting'
    | 'ready'
    | 'reconnecting'
    | 'offline'
    | 'error'
    | (string & {});

export type RuntimeChannel =
    | 'market.depth.delta'
    | 'market.trade.tick'
    | 'order.update'
    | 'position.update'
    | 'account.balance.update'
    | 'runtime.event'
    | (string & {});

export interface RuntimeSubscription {
    channel: RuntimeChannel;
    topic?: string;
    params?: Record<string, unknown>;
}

export interface RuntimeEvent<TPayload = unknown> {
    type: 'runtime.event';
    channel: RuntimeChannel;
    timestamp: number;
    payload: TPayload;
    sequence?: number;
    source: 'websocket' | 'rust-runtime' | 'unknown';
}

export interface RuntimeConnectionStateEvent {
    state: RuntimeConnectionState;
    source: 'websocket' | 'rust-runtime' | 'unknown';
    timestamp: number;
}

export type RuntimeUnlisten = () => void | Promise<void>;
export type RuntimeEventHandler = (event: RuntimeEvent) => void | Promise<void>;
export type RuntimeConnectionStateHandler = (
    event: RuntimeConnectionStateEvent
) => void | Promise<void>;

export interface RuntimeGateway {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    subscribe: (subscription: RuntimeSubscription) => Promise<void>;
    unsubscribe: (subscription: RuntimeSubscription) => Promise<void>;
    onEvent: (handler: RuntimeEventHandler) => RuntimeUnlisten;
    onConnectionState: (handler: RuntimeConnectionStateHandler) => RuntimeUnlisten;
}
