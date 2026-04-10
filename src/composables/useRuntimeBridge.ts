import { isDesktopRuntime } from '~/services/runtime/environment';

const RUNTIME_CONNECTION_STATE_EVENT = 'runtime.connection.state';

type MaybePromiseVoid = void | Promise<void>;

export type RuntimeConnectionState =
    | 'connecting'
    | 'ready'
    | 'reconnecting'
    | 'offline'
    | 'error'
    | (string & {});

export interface RuntimeConnectionStatePayload {
    state: RuntimeConnectionState;
    source: string;
    timestamp: number;
}

export const useRuntimeBridge = () => {
    const isDesktop = isDesktopRuntime();

    const pingRuntime = async (name = 'trader') => {
        if (!isDesktop) {
            return `pong from web: ${name}`;
        }

        const { invoke } = await import('@tauri-apps/api/core');
        return invoke<string>('ping_rust', { name });
    };

    const emitConnectionState = async (state: RuntimeConnectionState) => {
        if (!isDesktop) {
            return;
        }

        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('emit_runtime_state', { state });
    };

    const onConnectionState = async (
        handler: (payload: RuntimeConnectionStatePayload) => MaybePromiseVoid
    ) => {
        if (!isDesktop) {
            return async () => {};
        }

        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<RuntimeConnectionStatePayload>(
            RUNTIME_CONNECTION_STATE_EVENT,
            async (event) => {
                await handler(event.payload);
            }
        );

        return unlisten;
    };

    return {
        isDesktop,
        pingRuntime,
        emitConnectionState,
        onConnectionState
    };
};
