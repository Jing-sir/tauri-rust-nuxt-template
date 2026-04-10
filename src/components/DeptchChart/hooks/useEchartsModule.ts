import { shallowRef } from 'vue';

/**
 * Lazy-load and cache ECharts core + required components.
 *
 * Why:
 * - Reduce initial bundle cost.
 * - Avoid re-registering charts/components on each chart mount.
 */
export function useEchartsModule() {
    const echartsModule = shallowRef<typeof import('echarts/core') | null>(null);

    const ensureEcharts = async () => {
        if (echartsModule.value) return echartsModule.value;

        // Load minimal ECharts runtime: core + line chart + grid + dataZoom + canvas renderer.
        const [core, charts, components, renderers] = await Promise.all([
            import('echarts/core'),
            import('echarts/charts'),
            import('echarts/components'),
            import('echarts/renderers'),
        ]);

        core.use([
            charts.LineChart,
            components.TooltipComponent,
            components.GridComponent,
            components.DataZoomComponent,
            renderers.CanvasRenderer,
        ]);

        echartsModule.value = core;
        return core;
    };

    return { echartsModule, ensureEcharts };
}
