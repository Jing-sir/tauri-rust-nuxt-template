import enUS from '~/lang/en-US.json';
import zhCN from '~/lang/zh-CN.json';
import arAE from '~/lang/ar-AE.json';
import ruRU from '~/lang/ru-RU.json';

type MessageSchema = typeof enUS | typeof zhCN | typeof arAE | typeof ruRU;

const messages: {
    [key in 'en-US' | 'zh-CN' | 'ar-AE' | 'ru-RU']: MessageSchema
} = { // 语言包
    'en-US': enUS,
    'zh-CN': zhCN,
    'ar-AE': arAE,
    'ru-RU': ruRU,
};

const isProduction: boolean = process.env.NODE_ENV === 'production';

const localeDefault = 'en-US' as keyof typeof messages;

const languages = Object.keys(messages) as Array<keyof typeof messages>;

const localeSegments = localeDefault.split('-');
const localePrefix = localeSegments[0] ?? localeDefault;

const fallbackLocale: keyof typeof messages = languages.includes(localeDefault)
    ? localeDefault
    : languages.find((lan) => lan.indexOf(localePrefix) > -1) ?? localeDefault;

const i18n = defineI18nConfig(() => ({
    locale: fallbackLocale, // 设置语言环境
    fallbackLocale, // 如果未找到key,需要回溯到语言包的环境
    silentTranslationWarn: isProduction, // 警告信息
    messages, // 设置语言环境信息
    legacy: false // 是否不使用 composition-api 模式
}));

export default i18n;
