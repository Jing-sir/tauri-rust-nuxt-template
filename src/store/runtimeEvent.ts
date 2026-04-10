import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';
import type {
    RuntimeConnectionState,
    RuntimeConnectionStateEvent,
    RuntimeEvent,
} from '~/services/runtime';

const MAX_RECENT_EVENTS = 200;

export const useRuntimeEventStore = defineStore('runtime-event', () => {
    const connectionState = shallowRef<RuntimeConnectionState>('offline');
    const connectionSource = shallowRef<'websocket' | 'rust-runtime' | 'unknown'>('unknown');
    const lastConnectionAt = shallowRef<number | null>(null);

    const eventCount = shallowRef(0);
    const droppedBySequenceCount = shallowRef(0);
    const lastSequenceByChannel = shallowRef<Record<string, number>>({});
    const latestEventByChannel = shallowRef<Record<string, RuntimeEvent>>({});
    const recentEvents = shallowRef<RuntimeEvent[]>([]);

    const isRuntimeReady = computed(() => connectionState.value === 'ready');

    function dispatchConnectionState(event: RuntimeConnectionStateEvent) {
        connectionState.value = event.state;
        connectionSource.value = event.source;
        lastConnectionAt.value = event.timestamp;
    }

    function dispatchRuntimeEvent(event: RuntimeEvent) {
        const { sequence } = event;
        if (typeof sequence === 'number' && Number.isFinite(sequence)) {
            const previousSequence = lastSequenceByChannel.value[event.channel];
            if (typeof previousSequence === 'number' && sequence <= previousSequence) {
                droppedBySequenceCount.value += 1;
                return;
            }

            lastSequenceByChannel.value = {
                ...lastSequenceByChannel.value,
                [event.channel]: sequence,
            };
        }

        latestEventByChannel.value = {
            ...latestEventByChannel.value,
            [event.channel]: event,
        };

        recentEvents.value = [event, ...recentEvents.value].slice(0, MAX_RECENT_EVENTS);
        eventCount.value += 1;
    }

    function clearRuntimeEvents() {
        eventCount.value = 0;
        droppedBySequenceCount.value = 0;
        lastSequenceByChannel.value = {};
        latestEventByChannel.value = {};
        recentEvents.value = [];
    }

    return {
        connectionState,
        connectionSource,
        lastConnectionAt,
        eventCount,
        droppedBySequenceCount,
        latestEventByChannel,
        recentEvents,
        isRuntimeReady,
        dispatchConnectionState,
        dispatchRuntimeEvent,
        clearRuntimeEvents,
    };
});
