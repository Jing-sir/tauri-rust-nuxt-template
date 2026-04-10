<script setup lang="ts">
import { login } from '@/api/sys';
const { t } = useI18n();
const router = useRouter();
const message = useMessage();

interface LoginFormState {
    account: string;
    password: string;
}

const formState = reactive<LoginFormState>({
    account: '',
    password: '',
});

const errors = reactive<Record<keyof LoginFormState, string | null>>({
    account: null,
    password: null,
});

const isLoading = shallowRef(false);

const validate = () => {
    errors.account = formState.account ? null : t('用户名错误');
    errors.password = formState.password ? null : t('请输入密码');
    return !errors.account && !errors.password;
};

const handleSubmit = async () => {
    if (isLoading.value) return;
    if (!validate()) return;

    try {
        isLoading.value = true;
        const result = await login({
            account: formState.account,
            password: formState.password,
            facode: '',
        });
        useCookie('token').value = result.token;
        message.success(t('登录成功'));
        await router.push('/');
    } catch (error: any) {
        message.error(error?.msg ?? t('登录失败，请稍后重试'));
    } finally {
        isLoading.value = false;
    }
};
</script>

<template>
    <section class="flex min-h-[70vh] items-center justify-center py-12">
        <UCard class="w-full max-w-md border border-white/70 bg-white/90 shadow-xl dark:border-slate-800/60 dark:bg-slate-900/70">
            <template #header>
                <div class="space-y-1 text-center">
                    <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
                        {{ t('登录标题') }}
                    </h2>
                    <p class="text-sm text-slate-500 dark:text-slate-300">
                        {{ t('使用受信账号进入您的多市场工作区。') }}
                    </p>
                </div>
            </template>

            <UForm
                :state="formState"
                class="space-y-4"
                @submit.prevent="handleSubmit"
            >
                <UFormGroup
                    :label="t('用户名')"
                    :error="errors.account ?? undefined"
                >
                    <UInput
                        v-model="formState.account"
                        icon="i-heroicons-user-circle-20-solid"
                        autocomplete="username"
                        size="lg"
                    />
                </UFormGroup>

                <UFormGroup
                    :label="t('登录表单密码')"
                    :error="errors.password ?? undefined"
                >
                    <UInput
                        v-model="formState.password"
                        type="password"
                        icon="i-heroicons-lock-closed-20-solid"
                        autocomplete="current-password"
                        size="lg"
                    />
                </UFormGroup>

                <div class="flex items-center justify-between text-sm">
                    <span class="text-slate-500 dark:text-slate-400">
                        {{ t('我们会对敏感字段进行端到端加密') }}
                    </span>
                    <ULink
                        to="/"
                        class="text-emerald-600 hover:text-emerald-500"
                    >
                        {{ t('返回首页') }}
                    </ULink>
                </div>

                <UButton
                    type="submit"
                    size="lg"
                    block
                    :loading="isLoading"
                >
                    {{ t('立即登录') }}
                </UButton>
            </UForm>
        </UCard>
    </section>
</template>
