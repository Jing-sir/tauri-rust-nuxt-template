import { DesktopRuntimeGateway } from './desktop/DesktopRuntimeGateway';
import { isDesktopRuntime } from './environment';
import type { RuntimeGateway } from './types';
import { WebRuntimeGateway, type WebRuntimeGatewayOptions } from './web/WebRuntimeGateway';

export interface RuntimeGatewayFactoryOptions {
    web: WebRuntimeGatewayOptions;
    preferDesktop?: boolean;
}

export const createRuntimeGateway = (
    options: RuntimeGatewayFactoryOptions
): RuntimeGateway => {
    if (options.preferDesktop !== false && isDesktopRuntime()) {
        return new DesktopRuntimeGateway();
    }

    return new WebRuntimeGateway(options.web);
};
