/// <reference types="nuxt/schema" />
/// <reference types="@nuxtjs/i18n" />
/// <reference path="../.nuxt/components.d.ts" />
/// <reference path="../.nuxt/types/imports.d.ts" />

declare module '#app' {
    interface NuxtApp {
        $ensureWasmRuntime: () => Promise<void>;
    }
}

declare module 'vue' {
    interface ComponentCustomProperties {
        $ensureWasmRuntime: () => Promise<void>;
    }
}

export {};
