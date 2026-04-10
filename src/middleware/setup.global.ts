export default defineNuxtRouteMiddleware((to) => {
    const token = useCookie('token');

    if (!token.value && to.meta.requiresAuth) {
        return navigateTo('/login');
    }

    if (token.value && to.path === '/login') {
        return navigateTo('/');
    }
});
