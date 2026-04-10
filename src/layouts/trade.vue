<script setup lang="ts">
import AppHeader from '@/components/Header.vue';
</script>

<template>
    <div class="flex min-h-screen flex-col bg-slate-50/80 text-slate-900 dark:bg-slate-950/95 dark:text-slate-100">
        <AppHeader />
        <main class="flex-1 px-2 py-2 sm:px-3 lg:px-4">
            <slot />
        </main>
    </div>
</template>
