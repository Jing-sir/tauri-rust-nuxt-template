export const NUMBER_MAX = Number.MAX_SAFE_INTEGER; // 安全区域内的最大数值[Java = Integer.MAX_VALUE = 2 ** 31 - 1]
export const NUMBER_MIN = Number.MIN_SAFE_INTEGER; // 安全区域内的最小数值
export const PASSWORD = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[[\]a-zA-Z\d!@#$%^&*().,;?`'"/{}_\-+=|:<>~\\ ]{6,30}$/; // 6-15位数字 + 大小写字母密码
export const SIX_NUMBER = /^[0-9]{6}$/; // 6为正实数密码 / code
export const THOUSANDS_REGULAR = /\B(?=(\d{3})+(?!\d))/g; // 千分符
export const NUMBER = /^(1|[1-9][0-9]*)$/; // 只能输入1和非零开头的数字
export const INTER_NUMBER = /^[0-9]\d*$/; // 正整数限制输入
export const IP_V4 = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/; // ip地址校验
export const IP_V6 = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$/; // ip v6地址校验
export const GREATER_THAN_ZERO_NUMBER = /^(0\.\d+|[1-9]\d*(\.\d+)?)$/; // 大于0的正则
export const EMAIL = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/; // 邮箱
export const VERSION_NUMBER_RULES =
    /^([1-9]\d|[1-9])(\.([1-9]\d|\d)){2}(\+([a-zA-z0-9]*[0-9]+[a-zA-z0-9]*))$/; // 版本号正则

interface PagingType {
    size: string;
    showSizeChanger: boolean;
    pageSizeOptions: number[];
    showQuickJumper: boolean;
    showTotal: (val: number) => void;
    total: number
    current: number
    pageSize: number
}

export const PagingDefaultConf: PagingType = {
    // paging 默认数据
    size: 'small',
    showSizeChanger: true,
    pageSizeOptions: [20, 30, 40, 50],
    showQuickJumper: true,
    showTotal: (total: number) => `共 ${total} 条记录`,
    total: 0,
    current: 1,
    pageSize: 20,
};
