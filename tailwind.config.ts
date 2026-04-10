import type { Config } from 'tailwindcss';

export default <Partial<Config>>{
    // 🌙 使用 class 控制暗黑模式（配合 @nuxtjs/color-mode）
    darkMode: 'class',

    // 📦 扫描文件（很重要，不然类不会生效）
    content: [
        './components/**/*.{vue,js,ts}',
        './layouts/**/*.vue',
        './pages/**/*.vue',
        './composables/**/*.{js,ts}',
        './plugins/**/*.{js,ts}',
        './app.vue',
        './error.vue'
    ],

    theme: {
        extend: {
            // 🎨 颜色系统（绑定 CSS 变量）
            colors: {
                text: {
                    primary: 'var(--text-primary)',
                    secondary: 'var(--text-secondary)',
                    tertiary: 'var(--text-tertiary)',
                    disabled: 'var(--text-disabled)',
                    inverse: 'var(--text-inverse)',
                    brand: 'var(--text-brand)',
                    success: 'var(--text-success)',
                    danger: 'var(--text-danger)',
                    warning: 'var(--text-warning)',
                },
                trade: {
                    buy: 'var(--text-buy)',
                    sell: 'var(--text-sell)',
                },

                // 🧱 背景（建议你后面也加）
                bg: {
                    primary: 'var(--bg-primary)',
                    secondary: 'var(--bg-secondary)',
                    card: 'var(--bg-card)',
                    hover: 'var(--bg-hover)',
                },

                // 🔲 边框
                border: {
                    primary: 'var(--border-primary)',
                    secondary: 'var(--border-secondary)',
                }
            },

            // 🔤 字体（可选）
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif']
            },

            // 📏 圆角（交易所常用偏小）
            borderRadius: {
                sm: '4px',
                DEFAULT: '6px',
                md: '8px',
                lg: '12px'
            },

            // 🌫 阴影（卡片用）
            boxShadow: {
                card: '0 2px 8px rgba(0, 0, 0, 0.05)'
            },

            // ⚡ 过渡（让盘口/颜色变化更丝滑）
            transitionProperty: {
                width: 'width',
                colors: 'color, background-color, border-color'
            }
        }
    },

    // 🔌 插件（可选）
    plugins: []
};
