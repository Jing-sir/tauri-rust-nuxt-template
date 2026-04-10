<script setup lang="ts">
import SpotTrading from '~/views/spot/SpotTrading.vue';

const { t } = useI18n();

useHead({
    title: t('现货交易'),
});

definePageMeta({
    layout: 'trade',
});
</script>

<template>
    <SpotTrading />
</template>
