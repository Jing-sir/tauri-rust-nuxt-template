import { http } from '@/http/useHttp';

export const login = (params: {
    account: string; // 用户名
    facode: string; // 验证码
    password: string; // 密码
}): Promise<{
    initLogin: boolean;
    passwordError: boolean;
    passwordErrorNum: number;
    token: string;
}> => http.post('/sys/login', params);
