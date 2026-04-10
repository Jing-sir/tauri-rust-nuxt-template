import binanceOrderbookWasmUrl from 'binance-orderbook-wasm/binance_orderbook_wasm_bg.wasm?url';

let wasmReadyPromise: Promise<void> | null = null;

function ensureWasmRuntime() {
    if (!wasmReadyPromise) {
        wasmReadyPromise = import('binance-orderbook-wasm')
            .then(async (module) => {
                await module.default(binanceOrderbookWasmUrl);
            })
            .catch((error) => {
                wasmReadyPromise = null;
                throw error;
            });
    }
    return wasmReadyPromise;
}

export default defineNuxtPlugin({
    name: 'wasm-runtime',
    enforce: 'pre',
    setup() {
        // 提前预热 wasm runtime，避免首个业务请求阻塞。
        void ensureWasmRuntime();
        return {
            provide: {
                ensureWasmRuntime,
            },
        };
    },
});
