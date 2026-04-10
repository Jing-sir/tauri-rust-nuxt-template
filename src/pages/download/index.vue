<script setup lang="ts">
const { t } = useI18n();
const localePath = useLocalePath();

useHead({
    title: t('下载'),
});
</script>

<template>
    <section class="flex min-h-[70vh] items-center justify-center py-12">
        <UCard class="w-full max-w-3xl border border-white/70 bg-white/90 shadow-xl dark:border-slate-800/60 dark:bg-slate-900/70">
            <template #header>
                <div class="space-y-2">
                    <UBadge color="primary" variant="soft">
                        {{ t('下载') }}
                    </UBadge>
                    <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
                        {{ t('下载页标题') }}
                    </h1>
                    <p class="max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-300">
                        {{ t('下载页说明') }}
                    </p>
                </div>
            </template>

            <div class="space-y-6">
                <div class="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/70 p-5 text-sm text-slate-600 dark:border-slate-700/70 dark:bg-slate-950/40 dark:text-slate-300">
                    {{ t('当前已完成路由占位，后续可继续接入真实业务内容。') }}
                </div>

                <div class="flex flex-wrap gap-3">
                    <UButton :to="localePath('/')" color="primary">
                        {{ t('返回首页') }}
                    </UButton>
                    <UButton :to="localePath('/spot')" color="neutral" variant="soft">
                        {{ t('现货交易') }}
                    </UButton>
                </div>
            </div>
        </UCard>
    </section>
</template>
