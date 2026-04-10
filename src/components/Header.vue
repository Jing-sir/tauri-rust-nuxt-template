<script setup lang="ts">
const { t, locale, setLocale } = useI18n();
const localePath = useLocalePath();
const colorMode = useColorMode();
const token = useCookie<string | null>('token');

type Lang = {
    code: 'en-US' | 'zh-CN' | 'ru-RU' | 'ar-AE';
    label: string;
    dir: 'ltr' | 'rtl';
};

const languages: Lang[] = [
    { code: 'zh-CN', label: '简体中文', dir: 'ltr' },
    { code: 'en-US', label: 'English', dir: 'ltr' },
    { code: 'ar-AE', label: 'العربية', dir: 'rtl' },
    { code: 'ru-RU', label: 'Русский', dir: 'ltr' },
];

const applyDocumentDirection = (nextLocale: string) => {
    const currentLanguage = languages.find(item => item.code === nextLocale);
    if (currentLanguage) {
        document.documentElement.setAttribute('dir', currentLanguage.dir);
    }
};

const changeLocale = async (code: 'en-US' | 'zh-CN' | 'ru-RU' | 'ar-AE') => {
    await setLocale(code);
    applyDocumentDirection(code);
};

const colorModeIcon = computed(() =>
    colorMode.value === 'dark'
        ? 'i-heroicons-sun'
        : 'i-heroicons-moon',
);

const isLoggedIn = computed(() => !!token.value);

const toggleColorMode = () => {
    colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
};

onMounted(() => {
    applyDocumentDirection(locale.value);
});
</script>

<template>
    <header class="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-gray-800 dark:bg-gray-950/95 dark:supports-[backdrop-filter]:bg-gray-950/80">
        <UContainer>
            <div class="flex h-14 items-center justify-between gap-4">
                <!-- Logo -->
                <NuxtLink :to="localePath('/')" class="flex items-center gap-2.5">
                    <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-green-600">
                        <UIcon name="i-heroicons-chart-bar-square" class="h-4 w-4 text-white" />
                    </div>
                    <div class="hidden sm:block">
                        <p class="text-sm font-semibold text-gray-900 dark:text-white">
                            {{ t('Nuxt 量化终端') }}
                        </p>
                    </div>
                </NuxtLink>

                <!-- Right Actions -->
                <div class="flex items-center gap-1.5">
                    <nav class="hidden items-center gap-1 md:flex">
                        <UButton
                            :to="localePath('/download')"
                            variant="ghost"
                            color="neutral"
                            size="sm"
                        >
                            {{ t('下载') }}
                        </UButton>
                        <UButton
                            :to="localePath('/contract')"
                            variant="ghost"
                            color="neutral"
                            size="sm"
                        >
                            {{ t('合约') }}
                        </UButton>
                    </nav>

                    <!-- Language Selector -->
                    <UPopover>
                        <UButton
                            icon="i-heroicons-language"
                            variant="ghost"
                            color="neutral"
                            size="sm"
                        />

                        <template #content>
                            <div class="w-32 p-1">
                                <button
                                    v-for="lang in languages"
                                    :key="lang.code"
                                    type="button"
                                    class="w-full rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                                    :class="locale === lang.code ? 'bg-gray-100 font-medium dark:bg-gray-800' : ''"
                                    @click="changeLocale(lang.code)"
                                >
                                    {{ lang.label }}
                                </button>
                            </div>
                        </template>
                    </UPopover>

                    <!-- Theme Toggle -->
                    <UButton
                        :icon="colorModeIcon"
                        variant="ghost"
                        color="neutral"
                        size="sm"
                        :aria-label="t('切换深浅色模式')"
                        @click="toggleColorMode"
                    />

                    <!-- Auth Buttons -->
                    <template v-if="!isLoggedIn">
                        <UButton
                            :to="localePath('/login')"
                            variant="soft"
                            color="neutral"
                            size="sm"
                            class="hidden sm:inline-flex"
                        >
                            {{ t('登录') }}
                        </UButton>

                        <UButton
                            :to="localePath('/register')"
                            variant="solid"
                            color="primary"
                            size="sm"
                        >
                            {{ t('注册') }}
                        </UButton>
                    </template>

                    <UButton
                        v-else
                        :to="localePath('/spot')"
                        variant="solid"
                        color="primary"
                        size="sm"
                    >
                        {{ t('现货交易') }}
                    </UButton>
                </div>
            </div>
        </UContainer>
    </header>
</template>
