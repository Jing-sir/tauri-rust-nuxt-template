<script setup lang="ts">
import AppHeader from '@/components/Header.vue';
import AppFooter from '@/components/Footer.vue';
</script>

<template>
    <div class="flex min-h-screen flex-col bg-slate-50/80 text-slate-900 dark:bg-slate-950/95 dark:text-slate-100">
        <AppHeader />
        <main class="flex-1 py-8 px-4 sm:px-6 lg:px-8">
            <UContainer class="mx-auto max-w-6xl">
                <slot />
            </UContainer>
        </main>
        <AppFooter />
    </div>
</template>
