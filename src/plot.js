import { element } from "./dom.js";

const lineKeys = new Set(["hourly", "voltage"]);
const left = 46;
const top = 8;
const right = 14;
const temperatureGutter = 52;
const bottom = 27;

function range(values, padding) {
  const min = padding ? Math.min(...values) - padding : 0;
  const max = padding ? Math.max(...values) + padding : Math.max(0, ...values);
  const rough = (max - min) / 3 || 0.1;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((unit) => unit * power >= rough) ?? 10) * power;
  const start = Math.floor(min / step) * step;
  const end = Math.max(start + step, Math.ceil(max / step) * step);
  return { start, end, step };
}

function drawLine(ctx, values, x, y, color, partials, area) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  for (let start = 0; start < values.length;) {
    if (!Number.isFinite(values[start])) {
      start++;
      continue;
    }
    let end = start + 1;
    ctx.beginPath();
    ctx.moveTo(x(start), y(values[start]));
    while (Number.isFinite(values[end])) {
      ctx.lineTo(x(end), y(values[end]));
      end++;
    }
    ctx.stroke();
    if (area && end - start > 1) {
      ctx.lineTo(x(end - 1), area.base);
      ctx.lineTo(x(start), area.base);
      ctx.closePath();
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = area.gradient;
      ctx.fill();
      ctx.restore();
    }
    start = end;
  }
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const partial = partials[index];
    ctx.globalAlpha = partial ? 0.55 : 1;
    ctx.beginPath();
    ctx.arc(x(index), y(value), partial ? 3.5 : 2.3, 0, 2 * Math.PI);
    if (partial) ctx.stroke();
    else ctx.fill();
  });
  ctx.globalAlpha = 1;
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
    this.temperatureColor = element("span", "temperature-color");
    this.temperatureColor.hidden = true;
    this.node.append(this.canvas, this.readout, this.temperatureColor);
    this.resize = new ResizeObserver(() => this.draw());

    const inspect = (event) => {
      if (!this.points?.length) return;
      const rect = this.canvas.getBoundingClientRect();
      const relative = (event.clientX - rect.left - left) / (rect.width - left - this.right);
      if (this.key === "hourly") {
        const start = this.points[0].start;
        const time = start + relative * (this.points.at(-1).end - start);
        const index = this.points.findIndex(({ end }) => time < end);
        this.select(index === -1 ? this.points.length - 1 : index);
      } else {
        this.select(Math.max(0, Math.min(this.points.length - 1, Math.floor(relative * this.points.length))));
      }
    };
    this.canvas.addEventListener("pointermove", inspect);
    this.canvas.addEventListener("pointerdown", inspect);
    this.canvas.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && !this.node.matches(":focus")) this.select(null);
    });
    this.node.addEventListener("focus", () => {
      if (this.index == null) this.select(this.points.findLastIndex(({ value, temperature }) =>
        Number.isFinite(value) || (this.hasTemperature && Number.isFinite(temperature))));
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

  setData(points, unit, locale, zone, text, temperatureUnit) {
    this.points = points;
    this.unit = unit;
    this.text = text;
    this.temperatureUnit = temperatureUnit;
    this.hasTemperature = temperatureUnit != null && points.some(({ temperature }) => Number.isFinite(temperature));
    this.right = this.hasTemperature ? temperatureGutter : right;
    this.number = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
    this.axisNumber = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });
    this.shortDate = new Intl.DateTimeFormat(locale, this.key === "monthly"
      ? { month: "short", timeZone: "UTC" }
      : { day: "numeric", month: "short", timeZone: "UTC" });
    this.longDate = new Intl.DateTimeFormat(locale, this.key === "monthly"
      ? { month: "long", year: "numeric", timeZone: "UTC" }
      : { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    this.clock = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    this.offset = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "shortOffset" });
    this.node.setAttribute("aria-label", text[this.key] + ". " + text.tooltipHelp);
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
        this.number.format(point.value) + " " + this.unit;
      description = this.period(point) + " · " + value;
      if (this.hasTemperature) {
        const temperature = Number.isFinite(point.temperature)
          ? [this.number.format(point.temperature), this.temperatureUnit].filter(Boolean).join(" ")
          : this.text.missing;
        description += " · " + this.text.temperature + ": " + temperature;
      }
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
    return this.shortDate.format(point.key) + " " + point.label + offset;
  }

  draw() {
    if (!this.points?.length) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width <= left + this.right || height <= top + bottom) return;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    const ctx = this.canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    const style = getComputedStyle(this.node);
    // Canvas needs resolved colors. Read them from themed DOM properties.
    const colors = { line: style.color, text: getComputedStyle(this.readout).color, grid: style.borderTopColor };
    const values = this.points.map(({ value }) => value);
    const gasValues = values.filter(Number.isFinite);
    const chartWidth = width - left - this.right;
    const chartHeight = height - top - bottom;
    const slot = chartWidth / this.points.length;
    const hourly = this.key === "hourly";
    const first = this.points[0];
    const last = this.points.at(-1);
    const timeX = (time) => left + chartWidth * (time - first.start) / (last.end - first.start);
    const x = (index) => {
      if (!hourly) return left + slot * (index + 0.5);
      const point = this.points[index];
      return timeX((point.start + point.end) / 2);
    };
    const scale = ({ start, end }) => (value) => top + (end - value) / (end - start) * chartHeight;
    const primaryRange = gasValues.length ? range(gasValues, this.key === "voltage" ? 0.005 : 0) : null;
    const y = primaryRange && scale(primaryRange);
    const line = lineKeys.has(this.key);

    ctx.font = "11px " + style.fontFamily;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    if (primaryRange) {
      const { start, end, step } = primaryRange;
      for (let tick = 0; tick <= Math.round((end - start) / step); tick++) {
        const value = start + tick * step;
        ctx.fillStyle = colors.text;
        ctx.fillText(this.axisNumber.format(value), left - 7, y(value));
        ctx.fillStyle = colors.grid;
        ctx.fillRect(left, y(value), chartWidth, 1);
      }
    }

    ctx.fillStyle = colors.text;
    ctx.textAlign = "center";
    if (hourly) {
      const axisY = height - 10;
      ctx.fillText(first.label, left, axisY);
      let previousX = left;
      for (const point of this.points) {
        if (!["00:00", "06:00", "12:00", "18:00"].includes(point.label)) continue;
        const tickX = timeX(point.start);
        if (tickX - previousX < 38 || width - this.right - tickX < 38) continue;
        ctx.fillText(point.label, tickX, axisY);
        previousX = tickX;
      }
      ctx.fillText(this.clock.format(last.end), width - Math.max(16, this.right), axisY);
    } else {
      const stride = Math.ceil(this.points.length / Math.max(2, Math.floor(chartWidth / 52)));
      for (let index = 0; index < this.points.length; index += stride) {
        const point = this.points[index];
        ctx.fillText(this.shortDate.format(point.key), x(index), height - 10);
      }
    }

    const partials = this.points.map(({ partial }) => partial);
    if (primaryRange && line) {
      const base = top + chartHeight;
      const gradient = ctx.createLinearGradient(0, top, 0, base);
      gradient.addColorStop(0, colors.line);
      gradient.addColorStop(1, "transparent");
      drawLine(ctx, values, x, y, colors.line, partials, { gradient, base });
    } else if (primaryRange) {
      ctx.fillStyle = colors.line;
      values.forEach((value, index) => {
        if (value === null) return;
        ctx.globalAlpha = partials[index] ? 0.55 : 1;
        const bar = Math.min(32, slot * 0.67);
        const zero = y(0);
        const barHeight = Math.max(1, Math.abs(zero - y(value)));
        ctx.beginPath();
        ctx.roundRect(x(index) - bar / 2, zero - barHeight, bar, barHeight, [3, 3, 0, 0]);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    if (this.hasTemperature) {
      const temperatures = this.points.map(({ temperature }) => temperature);
      const { start, end, step } = range(temperatures.filter(Number.isFinite), 0.5);
      const temperatureY = scale({ start, end });
      const blue = getComputedStyle(this.temperatureColor).color;
      ctx.textAlign = "left";
      ctx.fillStyle = blue;
      for (let tick = 0; tick <= Math.round((end - start) / step); tick++) {
        const value = start + tick * step;
        const label = [this.axisNumber.format(value), this.temperatureUnit].filter(Boolean).join(" ");
        ctx.fillText(label, width - this.right + 5, temperatureY(value), this.right - 6);
      }
      drawLine(ctx, temperatures, x, temperatureY, blue, partials);
    }
    if (this.index != null) {
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x(this.index), top, 1, chartHeight);
      ctx.globalAlpha = 1;
    }
  }
}
