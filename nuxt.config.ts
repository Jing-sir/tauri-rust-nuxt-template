import path from 'node:path';

const DEFAULT_PUBLIC_API_BASE = 'http://8.218.199.96:10002';

export default defineNuxtConfig({
    compatibilityDate: '2026-03-10',
    future: { compatibilityVersion: 4 },
    devtools: { enabled: true },
    srcDir: 'src/',
    alias: {
        '@': path.resolve(__dirname, 'src'),
    },
    runtimeConfig: {
        baseURL: process.env.NUXT_INTERNAL_BASE_URL ?? 'http://localhost:3000',
        public: {
            appBase: process.env.NUXT_PUBLIC_APP_BASE ?? '/',
            apiBase: process.env.NUXT_PUBLIC_API_BASE ?? DEFAULT_PUBLIC_API_BASE,
        },
    },
    imports: {
        autoImport: true,
        dirs: ['composables', 'utils', 'store', 'hooks', 'services'],
    },
    app: {
        baseURL: process.env.NUXT_PUBLIC_APP_BASE ?? '/',
        head: {
            title: 'Nuxt Trading Console',
            link: [{ rel: 'icon', type: 'image/x-icon', href: 'favicon.png' }],
        },
    },
    appConfig: {
        ui: {
            primary: 'emerald',
            gray: 'slate',
        },
        // Nuxt Icon default endpoint is `/api/_nuxt_icon`, which conflicts with our Vite `/api` proxy.
        // Move it out of `/api/*` so it is served locally and not proxied to backend.
        icon: {
            localApiEndpoint: '/_nuxt_icon',
        },
    },
    css: [
        '@/assets/stylesheet/theme.css',
        '@/assets/stylesheet/main.css',
        '@/assets/stylesheet/base.css',
        '@/assets/stylesheet/tailwind.css',
    ],
    modules: [
        '~/modules/fix-nuxt-ui-imports',
        '@nuxtjs/color-mode',
        '@nuxt/ui',
        '@pinia/nuxt',
        '@nuxtjs/i18n',
        'dayjs-nuxt',
        'nuxt-tradingview',
    ],
    i18n: {
        vueI18n: '~/i18n.config.ts',

        // 默认语言
        defaultLocale: 'en-US',

        // 支持的语言
        locales: [
            { code: 'en-US', iso: 'en-US', name: 'English', dir: 'ltr' },
            { code: 'zh-CN', iso: 'zh-CN', name: '中文', dir: 'ltr' },
            { code: 'ru-RU', iso: 'ru-RU', name: 'Русский', dir: 'ltr' },
            { code: 'ar-AE', iso: 'ar-AE', name: 'العربية', dir: 'rtl' },
        ],

        // URL策略
        strategy: 'prefix_except_default',

        // 自动根据浏览器语言
        detectBrowserLanguage: {
            useCookie: true,
            cookieKey: 'i18n_redirected',
            redirectOn: 'root',
            alwaysRedirect: false,
        },
    },
    colorMode: {
        preference: 'system',
        fallback: 'light',
        classSuffix: '',
        storageKey: 'nuxt-ui-color-mode',
    },
    // Avoid unstable vite-plugin-checker vueTsc worker errors in dev.
    // Run `yarn typecheck` manually when needed.
    typescript: { typeCheck: false },
    vite: {
        optimizeDeps: {
            include: [
                'dayjs',
                'dayjs/plugin/updateLocale',
                'dayjs/plugin/relativeTime',
                'dayjs/plugin/utc',
                'echarts',
                'echarts/core',
                'echarts/charts',
                'echarts/components',
                'echarts/renderers',
                '@tauri-apps/api/event',
                '@tauri-apps/api/core',
                '@vue/devtools-core',
                '@vue/devtools-kit',
            ],
            // Keep wasm package out of Vite prebundle cache.
            // The prebundled JS may point to a non-existent `.wasm` file in `.cache/vite/client/deps`.
            exclude: ['binance-orderbook-wasm'],
        },
        server: {
            proxy: {
                // Proxy business API calls to backend, but keep Nuxt Icon internal endpoint local.
                // Otherwise `/api/_nuxt_icon/*` gets proxied and fails with "socket hang up".
                '^/api(?!/_nuxt_icon)': {
                    target: process.env.NUXT_PUBLIC_API_BASE ?? DEFAULT_PUBLIC_API_BASE,
                    changeOrigin: true,
                },
            },
        },
    },
});
