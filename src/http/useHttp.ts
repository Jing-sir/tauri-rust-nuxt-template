import { useMessage } from '~/composables/useMessage';

const isAbsoluteURL = (url: string): boolean => /^https?:\/\//i.test(url);

const normalizeURL = (url: string): string => {
    if (isAbsoluteURL(url)) return url;
    return url.startsWith('/') ? url : `/${url}`;
};

const fetch = $fetch.create({
    // 请求拦截器
    onRequest({ options }) {
        const token = useCookie('token');
        const config = useRuntimeConfig();

        options.baseURL = options.baseURL ?? config.public.apiBase ?? config.baseURL;
        options.headers = new Headers(options.headers as HeadersInit | undefined);
        options.headers.set('token', String(token.value ?? ''));
        options.headers.set('lang', useNuxtApp().$i18n.locale.value);
    },

    // 响应拦截
    onResponse({ response }) {
        const message = useMessage();
        switch (response.status) {
        case 401:
            {
                // Preserve active locale in auth-expired redirect (`/zh-CN/login` instead of `/login`).
                const localePath = useLocalePath();
                void navigateTo(localePath('/login'));
            }
            return Promise.reject(response);
        case 200:
            response._data = response._data.data;
            return response._data;
        default:
            message.error(response._data.msg);
            return Promise.resolve(response._data);
        }
    },

    // 错误处理
    onResponseError({ response }) {
        const message = useMessage();
        message.error(response?._data?.msg ?? '请求失败');
        return Promise.reject(response?._data ?? null);
    },
});
// 自动导出
export const http = {
    get: <T>(url: string, params?: any) => {
        return fetch<T>(normalizeURL(url), { method: 'get', params });
    },

    post: <T>(url: string, body?: any) => {
        return fetch<T>(normalizeURL(url), { method: 'post', body });
    },

    put: <T>(url: string, body?: any) => {
        return fetch<T>(normalizeURL(url), { method: 'put', body });
    },

    delete: <T>(url: string, body?: any) => {
        return fetch<T>(normalizeURL(url), { method: 'delete', body });
    },
};
