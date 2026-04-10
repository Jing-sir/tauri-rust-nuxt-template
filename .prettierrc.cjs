/**
 * Prettier config aligned with existing ESLint rules in `.eslintrc.cjs`.
 *
 * Key choices:
 * - 4-space indentation (eslint: indent=4, vue/html-indent=4)
 * - Semicolons required (eslint: semi=always)
 * - Single quotes (eslint: quotes=single)
 */
module.exports = {
    semi: true,
    singleQuote: true,
    tabWidth: 4,
    useTabs: false,
    printWidth: 120,
    trailingComma: 'es5',
    bracketSpacing: true,
    arrowParens: 'always',
    endOfLine: 'lf',
    // Do not indent `<script>` / `<style>` blocks in Vue SFCs.
    // ESLint `indent` expects top-level script code to start at column 0.
    vueIndentScriptAndStyle: false
};
