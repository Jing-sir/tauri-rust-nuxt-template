export const isDesktopRuntime = () => {
    if (typeof window === 'undefined') {
        return false;
    }

    const desktopWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
    return Boolean(desktopWindow.__TAURI_INTERNALS__);
};
