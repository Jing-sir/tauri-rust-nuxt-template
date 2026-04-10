import { defineNuxtModule } from '@nuxt/kit';

export default defineNuxtModule({
    meta: {
        name: 'fix-nuxt-ui-imports',
    },
    setup(_, nuxt) {
        nuxt.hook('imports:extend', (imports) => {
            const invalid = ['config', 'bind'];
            for (let i = imports.length - 1; i >= 0; i--) {
                const item = imports[i];
                if (!item || !item.from?.includes('@nuxt/ui/dist/runtime/composables/useFormGroup')) continue;
                if (item.name && invalid.includes(item.name)) {
                    imports.splice(i, 1);
                }
            }
        });
    }
});
