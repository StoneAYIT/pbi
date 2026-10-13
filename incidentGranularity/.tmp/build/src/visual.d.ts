import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
export declare class Visual implements IVisual {
    private host;
    private selectionManager;
    private tooltipService;
    private root;
    private toolbar;
    private svg;
    private buttons;
    private splitButton;
    private mode;
    private splitByYear;
    private rows;
    private width;
    private height;
    constructor(options: VisualConstructorOptions);
    update(options: VisualUpdateOptions): void;
    private bucketOf;
    private render;
}
