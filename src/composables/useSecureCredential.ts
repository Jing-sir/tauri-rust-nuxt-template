import { isDesktopRuntime } from '~/services/runtime';

const DEFAULT_SECURE_SERVICE = 'com.xiangnan.tradingdesktop.credentials';

export interface UseSecureCredentialOptions {
    service?: string;
}

const resolveService = (service?: string) => {
    const normalized = service?.trim();
    return normalized && normalized.length > 0 ? normalized : DEFAULT_SECURE_SERVICE;
};

export const useSecureCredential = (options: UseSecureCredentialOptions = {}) => {
    const isDesktop = isDesktopRuntime();
    const service = resolveService(options.service);

    const ensureDesktop = () => {
        if (!isDesktop) {
            throw new Error('secure credential storage is only available in desktop runtime');
        }
    };

    const saveCredential = async (account: string, secret: string) => {
        ensureDesktop();
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_secure_credential', {
            service,
            account,
            secret,
        });
    };

    const loadCredential = async (account: string) => {
        ensureDesktop();
        const { invoke } = await import('@tauri-apps/api/core');
        return invoke<string | null>('load_secure_credential', {
            service,
            account,
        });
    };

    const deleteCredential = async (account: string) => {
        ensureDesktop();
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('delete_secure_credential', {
            service,
            account,
        });
    };

    return {
        isDesktop,
        service,
        saveCredential,
        loadCredential,
        deleteCredential,
    };
};
