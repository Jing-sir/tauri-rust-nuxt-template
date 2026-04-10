import type { UseFetchOptions } from 'nuxt/app';

type Methods = 'GET' | 'POST' | 'DELETE' | 'PUT';

export interface IResultData<T> {
    code: number;
    data: T;
    msg: string;
}

class HttpRequest {
    async request<T = any>(url: string, method: Methods, data: any, options?: UseFetchOptions<T>) {
        const config = useRuntimeConfig();
        const newOptions: UseFetchOptions<T> = {
            method,
            ...options,
        };

        newOptions.baseURL = newOptions.baseURL ?? config.public.apiBase ?? config.baseURL;

        if (method === 'GET' || method === 'DELETE') {
            newOptions.params = data;
        } else if (method === 'POST' || method === 'PUT') {
            newOptions.body = data;
        }

        const { data: responseData } = await useFetch(url, newOptions);
        // @ts-ignore
        return responseData.value?.data;
    }

    async get<T = any>(url: string, params?: any, options?: UseFetchOptions<T>) {
        return this.request<T>(url, 'GET', params, options);
    }

    async post<T = any>(url: string, data: any, options?: UseFetchOptions<T>) {
        return this.request<T>(url, 'POST', data, options);
    }

    async put<T = any>(url: string, data: any, options?: UseFetchOptions<T>) {
        return this.request<T>(url, 'PUT', data, options);
    }

    async delete<T = any>(url: string, params: any, options?: UseFetchOptions<T>) {
        return this.request<T>(url, 'DELETE', params, options);
    }
}

const httpRequest = new HttpRequest();

export default httpRequest;
