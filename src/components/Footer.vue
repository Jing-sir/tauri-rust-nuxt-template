<script setup lang="ts">
const { t } = useI18n();
const year = new Date().getFullYear();

const footerLinks = computed(() => [
    { label: t('组件文档'), href: 'https://ui.nuxt.com' },
    { label: t('隐私政策'), href: 'https://nuxt.com/legal' },
    { label: t('系统状态'), href: 'https://status.nuxt.com' },
]);
</script>

<template>
    <footer class="border-t border-white/40 bg-white/70 backdrop-blur dark:border-slate-800/60 dark:bg-slate-950/60">
        <UContainer class="flex flex-col gap-6 py-6 text-sm text-slate-500 dark:text-slate-400 md:flex-row md:items-center md:justify-between">
            <div>
                <p class="font-semibold text-slate-700 dark:text-slate-200">
                    {{ t('页脚标题') }}
                </p>
                <p class="mt-1 max-w-xl">
                    {{ t('统一的实时行情、策略编排与风控监控工作区，面向全球团队开放。') }}
                </p>
                <p class="mt-2">
                    © {{ year }} · {{ t('保留所有权利') }}
                </p>
            </div>
            <div class="flex flex-wrap gap-4">
                <ULink
                    v-for="link in footerLinks"
                    :key="link.href"
                    :to="link.href"
                    target="_blank"
                    class="transition-colors hover:text-emerald-500"
                >
                    {{ link.label }}
                </ULink>
            </div>
        </UContainer>
    </footer>
</template>
