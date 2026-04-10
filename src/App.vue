<script setup lang="ts">
const { locale } = useI18n();
const colorMode = useColorMode();

// 语言或主题切换时，确保页面被强制刷新，避免 Element Plus 式的缓存问题
const renderKey = computed(() => `app-${locale.value}-${colorMode.value}`);

let preventPageZoomByWheel: ((event: WheelEvent) => void) | null = null;

onMounted(() => {
    if (typeof window === 'undefined') return;

    preventPageZoomByWheel = (event: WheelEvent) => {
        // 防止 Ctrl/⌘ + 滚轮触发浏览器页面缩放，避免交易页布局被误放大/缩小。
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
    };

    window.addEventListener('wheel', preventPageZoomByWheel, { passive: false });
});

onBeforeUnmount(() => {
    if (typeof window === 'undefined' || !preventPageZoomByWheel) return;
    window.removeEventListener('wheel', preventPageZoomByWheel);
    preventPageZoomByWheel = null;
});
</script>

<template>
    <ColorScheme tag="div" class="min-h-screen bg-transparent">
        <UApp :tooltip="{ delayDuration: 150 }">
            <NuxtLayout>
                <NuxtPage :key="renderKey" />
            </NuxtLayout>
        </UApp>
    </ColorScheme>
</template>
