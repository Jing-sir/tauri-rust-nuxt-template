/**
 * useMessage — Toast 消息通知封装
 *
 * 基于 @nuxt/ui 的 useToast 进行二次封装，提供统一的成功、错误、警告、信息四种消息类型。
 * 默认标题为中文（历史行为），调用方可通过第二个参数自定义标题。
 */
export const useMessage = () => {
    // 获取 @nuxt/ui 提供的 toast 实例
    const toast = useToast();

    /**
     * 显示成功消息
     * @param description 消息正文
     * @param title       可选标题，默认为"成功"
     */
    const success = (description: string, title = '成功') => {
        toast.add({
            title,
            description,
            color: 'success'
        });
    };

    /**
     * 显示错误消息
     * @param description 消息正文
     * @param title       可选标题，默认为"错误"
     */
    const error = (description: string, title = '错误') => {
        toast.add({
            title,
            description,
            color: 'error'
        });
    };

    /**
     * 显示警告消息
     * @param description 消息正文
     * @param title       可选标题，默认为"提示"
     */
    const warning = (description: string, title = '提示') => {
        toast.add({
            title,
            description,
            color: 'warning'
        });
    };

    /**
     * 显示普通信息消息
     * @param description 消息正文
     * @param title       可选标题，默认为"提示"
     */
    const info = (description: string, title = '提示') => {
        toast.add({
            title,
            description,
            color: 'info'
        });
    };

    return {
        success,
        error,
        warning,
        info
    };
};