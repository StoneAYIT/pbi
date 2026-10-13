import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import ITooltipService = powerbi.extensibility.ITooltipService;

type Mode = "month" | "day" | "hour";

interface IncidentRow {
  date: Date;
  year: number;
  id: ISelectionId;
  key: string;
}

const MODES: Mode[] = ["month", "day", "hour"];
const LABELS: Record<Mode, string[]> = {
  month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  hour: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")),
};
const SVG_NS = "http://www.w3.org/2000/svg";

export class Visual implements IVisual {
  private host: IVisualHost;
  private selectionManager: ISelectionManager;
  private tooltipService: ITooltipService;

  private root: HTMLDivElement;
  private toolbar: HTMLDivElement;
  private svg: SVGSVGElement;
  private buttons = new Map<Mode, HTMLButtonElement>();
  private splitButton: HTMLButtonElement;

  private mode: Mode = "month";
  private splitByYear = true;
  private rows: IncidentRow[] = [];
  private width = 300;
  private height = 200;

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;
    this.selectionManager = this.host.createSelectionManager();
    this.tooltipService = this.host.tooltipService;

    this.root = document.createElement("div");
    this.root.className = "incident-visual";
    options.element.appendChild(this.root);

    this.toolbar = document.createElement("div");
    this.toolbar.className = "toolbar";
    MODES.forEach(m => {
      const b = document.createElement("button");
      b.textContent = "Per " + m;
      b.onclick = () => { this.mode = m; this.render(); };
      this.buttons.set(m, b);
      this.toolbar.appendChild(b);
    });

    this.splitButton = document.createElement("button");
    this.splitButton.textContent = "Split by year";
    this.splitButton.style.marginLeft = "12px";
    this.splitButton.onclick = () => {
      this.splitByYear = !this.splitByYear;
      this.render();
    };
    this.toolbar.appendChild(this.splitButton);

    this.svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    this.svg.addEventListener("click", () => {
      this.selectionManager.clear().then(() => this.render());
    });

    this.root.append(this.toolbar, this.svg);
  }

  public update(options: VisualUpdateOptions) {
    this.width = options.viewport.width;
    this.height = Math.max(0, options.viewport.height - 32);

    this.rows = [];
    const table = options.dataViews?.[0]?.table;
    if (table) {
      const timeCol = table.columns.findIndex(c => c.roles?.incidentTime);
      table.rows.forEach((row, rowIndex) => {
        const v = row[timeCol];
        if (v === null || v === undefined) return;
        const date = new Date(v as any);
        const id = this.host
          .createSelectionIdBuilder()
          .withTable(table, rowIndex)
          .createSelectionId();
        this.rows.push({ date, year: date.getFullYear(), id, key: id.getKey() });
      });
    }
    this.render();
  }

  private bucketOf(d: Date): number {
    switch (this.mode) {
      case "month": return d.getMonth();
      case "day":   return (d.getDay() + 6) % 7; // Monday first
      case "hour":  return d.getHours();
    }
  }

  private render() {
    const labels = LABELS[this.mode];

    // Distinct years, ascending (only used when splitting)
    const years = this.splitByYear
      ? Array.from(new Set(this.rows.map(r => r.year))).sort((a, b) => a - b)
      : [];
    const yearIndex = new Map<number, number>(years.map((y, i) => [y, i]));
    const seriesCount = this.splitByYear ? Math.max(1, years.length) : 1;
    const legendOn = this.splitByYear && years.length > 0;

    // cells[bucket][series] = incident rows
    const cells: IncidentRow[][][] = labels.map(() =>
      Array.from({ length: seriesCount }, () => [] as IncidentRow[])
    );
    this.rows.forEach(r => {
      const b = this.bucketOf(r.date);
      const s = this.splitByYear ? (yearIndex.get(r.year) as number) : 0;
      cells[b][s].push(r);
    });
    const totals = cells.map(c => c.reduce((n, s) => n + s.length, 0));

    this.buttons.forEach((btn, m) => btn.classList.toggle("active", m === this.mode));
    this.splitButton.classList.toggle("active", this.splitByYear);

    const selected = new Set(
      this.selectionManager.getSelectionIds().map(s => (s as ISelectionId).getKey())
    );
    const anySelected = selected.size > 0;

    const colorFor = (s: number): string =>
      legendOn
        ? this.host.colorPalette.getColor(String(years[s])).value
        : this.host.colorPalette.getColor("incidents").value;

    const top = legendOn ? 34 : 16, bottom = 22, side = 8;
    const innerW = Math.max(0, this.width - side * 2);
    const innerH = Math.max(0, this.height - top - bottom);
    const slot = innerW / labels.length;
    const max = Math.max(1, ...totals);

    this.svg.setAttribute("width", String(this.width));
    this.svg.setAttribute("height", String(this.height));
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);

    // Legend
    if (legendOn) {
      years.forEach((yr, k) => {
        const lx = side + k * 52;
        const sw = document.createElementNS(SVG_NS, "rect");
        sw.setAttribute("x", String(lx));
        sw.setAttribute("y", "6");
        sw.setAttribute("width", "10");
        sw.setAttribute("height", "10");
        sw.setAttribute("fill", colorFor(k));
        this.svg.appendChild(sw);

        const lt = document.createElementNS(SVG_NS, "text");
        lt.setAttribute("x", String(lx + 14));
        lt.setAttribute("y", "15");
        lt.textContent = String(yr);
        this.svg.appendChild(lt);
      });
    }

    labels.forEach((label, i) => {
      const x = side + i * slot;
      let yCursor = top + innerH; // stack from the bottom up

      cells[i].forEach((cell, s) => {
        if (!cell.length) return;
        const h = (cell.length / max) * innerH;
        yCursor -= h;
        const isSelected = cell.some(r => selected.has(r.key));

        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("class", "bar");
        rect.setAttribute("x", String(x + slot * 0.1));
        rect.setAttribute("y", String(yCursor));
        rect.setAttribute("width", String(slot * 0.8));
        rect.setAttribute("height", String(h));
        rect.setAttribute("fill", colorFor(s));
        rect.setAttribute("stroke", "#fff");
        rect.setAttribute("stroke-width", "0.5");
        rect.setAttribute("fill-opacity", !anySelected || isSelected ? "1" : "0.3");

        rect.addEventListener("click", (e: MouseEvent) => {
          e.stopPropagation();
          this.selectionManager
            .select(cell.map(r => r.id), e.ctrlKey || e.metaKey)
            .then(() => this.render());
        });
        rect.addEventListener("mousemove", (e: MouseEvent) => {
          const items = legendOn
            ? [
                ...years.map((yr, k) => ({
                  header: label,
                  displayName: String(yr),
                  value: String(cells[i][k].length),
                  color: colorFor(k),
                })),
                { header: label, displayName: "Total", value: String(totals[i]) },
              ]
            : [{ header: label, displayName: "Incidents", value: String(totals[i]) }];
          this.tooltipService.show({
            coordinates: [e.clientX, e.clientY],
            isTouchEvent: false,
            dataItems: items,
            identities: [],
          });
        });
        rect.addEventListener("mouseout", () => {
          this.tooltipService.hide({ immediately: false, isTouchEvent: false });
        });
        this.svg.appendChild(rect);
      });

      // Axis label
      const axis = document.createElementNS(SVG_NS, "text");
      axis.setAttribute("x", String(x + slot / 2));
      axis.setAttribute("y", String(this.height - 6));
      axis.setAttribute("text-anchor", "middle");
      axis.textContent = label;
      this.svg.appendChild(axis);

      // Total above the stack
      if (totals[i] > 0 && slot > 18) {
        const val = document.createElementNS(SVG_NS, "text");
        val.setAttribute("x", String(x + slot / 2));
        val.setAttribute("y", String(yCursor - 3));
        val.setAttribute("text-anchor", "middle");
        val.textContent = String(totals[i]);
        this.svg.appendChild(val);
      }
    });
  }
}
