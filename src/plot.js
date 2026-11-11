import { element } from "./dom.js";

const lineKeys = new Set(["hourly", "voltage"]);
const left = 46;
const top = 8;
const right = 14;
const bottom = 27;

function range(points, voltage, signed) {
  const values = points.map(({ value }) => value).filter(Number.isFinite);
  const min = voltage ? Math.min(...values) - 0.005 : signed ? Math.min(0, ...values) : 0;
  const max = voltage ? Math.max(...values) + 0.005 : Math.max(0, ...values);
  const rough = (max - min) / 3 || 0.1;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((unit) => unit * power >= rough) ?? 10) * power;
  const start = Math.floor(min / step) * step;
  const end = Math.max(start + step, Math.ceil(max / step) * step);
  return { start, end, step };
}

export class Plot {
  constructor(key) {
    this.key = key;
    this.node = element("div", "plot");
    this.canvas = element("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.readout = element("div", "readout");
    this.readout.setAttribute("aria-live", "polite");
    this.node.tabIndex = 0;
    this.node.setAttribute("role", "group");
    this.node.append(this.canvas, this.readout);
    this.resize = new ResizeObserver(() => this.draw());

    const inspect = (event) => {
      if (!this.points?.length) return;
      const rect = this.canvas.getBoundingClientRect();
      const relative = (event.clientX - rect.left - left) / (rect.width - left - right);
      this.select(Math.max(0, Math.min(this.points.length - 1, Math.floor(relative * this.points.length))));
    };
    this.canvas.addEventListener("pointermove", inspect);
    this.canvas.addEventListener("pointerdown", inspect);
    this.canvas.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && !this.node.matches(":focus")) this.select(null);
    });
    this.node.addEventListener("focus", () => {
      if (this.index == null) this.select(this.points.findLastIndex(({ value }) => value !== null));
    });
    this.node.addEventListener("blur", () => this.select(null));
    this.node.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Escape") return this.select(null);
      if (event.key === "Home") return this.select(0);
      if (event.key === "End") return this.select(this.points.length - 1);
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      this.select(Math.max(0, Math.min(this.points.length - 1, (this.index ?? -1) + delta)));
    });
  }

  setData(points, unit, locale, zone, text, options = {}) {
    this.options = options;
    this.points = points;
    this.unit = unit;
    this.text = text;
    this.number = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
    this.axisNumber = new Intl.NumberFormat(locale, options.compactAxis
      ? { notation: "compact", maximumFractionDigits: 1 }
      : { maximumFractionDigits: 4 });
    this.shortDate = new Intl.DateTimeFormat(locale, this.key === "monthly"
      ? { month: "short", timeZone: "UTC" }
      : { day: "numeric", month: "short", timeZone: "UTC" });
    this.longDate = new Intl.DateTimeFormat(locale, this.key === "monthly"
      ? { month: "long", year: "numeric", timeZone: "UTC" }
      : { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    this.offset = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "shortOffset" });
    this.node.setAttribute("aria-label", (options.label ?? text[this.key]) + ". " + text.tooltipHelp);
    this.select(this.index < points.length ? this.index : null);
  }

  connect() {
    this.resize.observe(this.canvas);
    this.draw();
  }

  disconnect() {
    this.resize.disconnect();
  }

  select(index) {
    this.index = this.points?.[index] ? index : null;
    const point = this.points?.[this.index];
    let description = this.text?.tooltipHelp ?? "";
    if (point) {
      const value = point.value === null ? this.text.missing :
        this.options.value?.(point) ?? this.number.format(point.value) + " " + this.unit;
      description = (this.options.period?.(point) ?? this.period(point)) + " · " + value;
      if (point.partial) description += " · " + this.text.partial;
    }
    if (this.readout.textContent !== description) this.readout.textContent = description;
    this.draw();
  }

  period(point) {
    if (this.key !== "hourly") return this.longDate.format(point.key);
    // An offset makes the two identically labelled hours distinguishable.
    const offset = point.repeated
      ? " " + this.offset.formatToParts(point.start).find(({ type }) => type === "timeZoneName").value
      : "";
    return point.label + offset;
  }

  draw() {
    if (!this.points?.some(({ value }) => value !== null)) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width <= left + right || height <= top + bottom) return;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    const ctx = this.canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    const style = getComputedStyle(this.node);
    // Canvas needs resolved colors. Read them from themed DOM properties.
    const colors = { line: style.color, text: getComputedStyle(this.readout).color, grid: style.borderTopColor };
    const { start, end, step } = range(this.points, this.key === "voltage", this.options.signed);
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const slot = chartWidth / this.points.length;
    const x = (index) => left + slot * (index + 0.5);
    const y = (value) => top + (end - value) / (end - start) * chartHeight;
    const line = lineKeys.has(this.key);

    ctx.font = "11px " + style.fontFamily;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    for (let tick = 0; tick <= Math.round((end - start) / step); tick++) {
      const value = start + tick * step;
      ctx.fillStyle = colors.text;
      ctx.fillText(this.axisNumber.format(value), left - 7, y(value));
      ctx.fillStyle = colors.grid;
      ctx.fillRect(left, y(value), chartWidth, 1);
    }

    ctx.fillStyle = colors.text;
    ctx.textAlign = "center";
    if (this.key === "hourly") {
      for (const [index, point] of this.points.entries()) {
        if (!["00:00", "06:00", "12:00", "18:00"].includes(point.label)) continue;
        ctx.fillText(point.label, left + slot * index, height - 10);
      }
      ctx.textAlign = "right";
      ctx.fillText("24:00", width - 2, height - 10);
    } else {
      const stride = Math.ceil(this.points.length / Math.max(2, Math.floor(chartWidth / 52)));
      for (let index = 0; index < this.points.length; index += stride) {
        const point = this.points[index];
        ctx.fillText(this.options.tick?.(point) ?? this.shortDate.format(point.key), x(index), height - 10);
      }
    }

    ctx.strokeStyle = colors.line;
    ctx.fillStyle = colors.line;
    ctx.lineWidth = 2;
    if (line) {
      ctx.beginPath();
      let previous = false;
      this.points.forEach(({ value }, index) => {
        if (value !== null) {
          if (previous) ctx.lineTo(x(index), y(value));
          else ctx.moveTo(x(index), y(value));
        }
        previous = value !== null;
      });
      ctx.stroke();
    }

    this.points.forEach(({ value, partial }, index) => {
      if (value === null) return;
      ctx.globalAlpha = partial ? 0.55 : 1;
      if (line) {
        ctx.beginPath();
        ctx.arc(x(index), y(value), partial ? 3.5 : 2.3, 0, 2 * Math.PI);
        if (partial) ctx.stroke();
        else ctx.fill();
      } else {
        const bar = Math.min(32, slot * 0.67);
        const zero = y(0);
        const barHeight = Math.max(1, Math.abs(zero - y(value)));
        const barTop = value < 0 ? zero : zero - barHeight;
        ctx.beginPath();
        ctx.roundRect(x(index) - bar / 2, barTop, bar, barHeight,
          value < 0 ? [0, 0, 3, 3] : [3, 3, 0, 0]);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    if (this.index != null) {
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x(this.index), top, 1, chartHeight);
      ctx.globalAlpha = 1;
    }
  }
}
