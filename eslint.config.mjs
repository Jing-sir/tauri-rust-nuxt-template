/**
 * ESLint Flat Config (ESLint v9+)
 *
 * Background:
 * - This repo uses ESLint v10, which no longer auto-loads `.eslintrc.*` by default.
 * - We previously had `.eslintrc.cjs`; keep it for reference, but ESLint will use this file.
 *
 * Goal:
 * - Preserve existing lint rules (indent=4, semi=always, single quotes, Vue html indent, etc.)
 * - Make `yarn lint` / `yarn lint:fix` work again.
 */

import createConfigForNuxt from '@nuxt/eslint-config';

export default createConfigForNuxt(
    {
        // Keep Nuxt defaults; we only append our project-specific rules below.
        dirs: {
            root: ['.'],
            src: ['src'],
        },
    },
    {
        name: 'project/ignores',
        // Keep generated files out of lint.
        ignores: ['types/**', '.nuxt/**', '.output/**', 'dist/**', 'node_modules/**'],
    },
    {
        name: 'project/custom-rules',
        rules: {
            quotes: [1, 'single'], // 引号类型 `` "" ''
            semi: ['error', 'always'],
            'no-console': 0,
            'no-debugger': 'warn',
            'global-require': 0,
            indent: ['error', 4],
            'array-bracket-spacing': [2, 'never'],
            'block-scoped-var': 0,
            'brace-style': [2, '1tbs', { allowSingleLine: true }],
            // Many external widgets (e.g. TradingView) use snake_case option keys.
            // Enforce camelCase for variables, but do not enforce it for object properties.
            camelcase: [2, { properties: 'never' }],
            'comma-spacing': [2, { before: false, after: true }],
            'comma-style': [2, 'last'],
            complexity: [2, 40],
            'computed-property-spacing': [2, 'never'],
            'default-case': 2,
            'dot-location': [2, 'property'],
            'dot-notation': [2, { allowKeywords: true }],
            'eol-last': 2,
            eqeqeq: [2, 'allow-null'],
            'import/extensions': [
                0,
                'ignorePackages',
                {
                    js: 'never',
                    jsx: 'never',
                    ts: 'never',
                    tsx: 'never',
                    vue: 'never',
                },
            ],
            'max-len': ['error', { code: 500 }],
            'arrow-parens': 'off',
            'no-param-reassign': ['error', { props: false }],
            'no-plusplus': 0,
            'linebreak-style': [0, 'error', 'windows'],
            'no-underscore-dangle': [0, { allow: ['_place'] }],
            'consistent-return': [0, { treatUndefinedAsUnspecified: true }],
            'no-unused-vars': 'off',
            'one-var': ['error', { var: 'always', let: 'always' }],
            'one-var-declaration-per-line': ['error', 'initializations'],
            'no-return-assign': ['error', 'always'],
            'no-prototype-builtins': 'off',
            'no-shadow': 'off',
            'prefer-destructuring': ['error', { object: true, array: false }],
            radix: ['error', 'as-needed'],
            'no-case-declarations': 'off',
            'no-nested-ternary': 'off',
            'no-lonely-if': 'off',
            'operator-assignment': 'off',
            'object-curly-newline': 'off',
            'class-methods-use-this': 'off',
            '@typescript-eslint/no-empty-function': 'off', // 允许空函数
            '@typescript-eslint/ban-ts-comment': 'off', // 允许使用ts-ignore注释代码块，忽略类型检测
            '@typescript-eslint/no-unused-vars': 'off', // 允许声明变量，不使用
            '@typescript-eslint/no-explicit-any': 'off', // 允许使用any来解决类型问题（不推荐）
            '@typescript-eslint/ban-types': 'off', // 允许使用object来代替任何对象的类型（适用范围为变量，不推荐）
            '@typescript-eslint/no-inferrable-types': 'off', // 允许在明确的数据类型前继续添加类型
            '@typescript-eslint/explicit-module-boundary-types': 'off', // 允许函数参数为any类型（不推荐）
            'vue/multi-word-component-names': 'off',
            'import/named': 'off',
            'import/no-extraneous-dependencies': 'off',
            'no-undef': 'off',
            'vue/v-on-event-hyphenation': 'off',
            'import/no-unresolved': 'off',
            'vue/html-indent': ['error', 4],
        },
    }
);
