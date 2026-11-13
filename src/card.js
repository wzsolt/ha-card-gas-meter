import { CARD_TYPE, CHARTS, FIELDS, calendar, fetchHistory, fetchSeries, hourlyTemperature, normalizeConfig, numeric, sourceFor } from "./data.js";
import { element, icon } from "./dom.js";
import { GasMeterEditor, loadEditorForm } from "./editor.js";
import { Plot } from "./plot.js";
import { cardStyles } from "./styles.js";
import { labels, localeFor, theme } from "./text.js";

const refreshInterval = 5 * 60_000;
const chartIcons = {
  hourly: "mdi:chart-timeline-variant", daily: "mdi:chart-bar",
  monthly: "mdi:calendar-month-outline", voltage: "mdi:flash-outline",
};

function summaryChip(symbol, field) {
  const node = element("div", "chip " + field);
  const copy = element("div", "chip-copy");
  const label = element("span", "chip-label");
  const value = element("span", "chip-value");
  copy.append(label, value);
  node.append(icon(symbol), copy);
  return { node, label, value, field };
}

class GasMeterCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.views = new Map();
    const style = element("style", "", cardStyles);
    const card = element("ha-card");
    const content = element("div", "gas-card");
    const header = element("div", "header");
    const titleGroup = element("div", "title-group");
    const glyph = element("span", "glyph");
    glyph.append(icon("mdi:meter-gas-outline"));
    this.titleHeading = element("h2");
    titleGroup.append(glyph, this.titleHeading);

    const reading = element("div", "reading");
    this.readingLabel = element("div", "reading-label");
    this.readingValue = element("span", "reading-value");
    this.readingUnit = element("span", "reading-unit");
    const readingRow = element("div", "reading-row");
    readingRow.append(this.readingValue, this.readingUnit);
    reading.append(this.readingLabel, readingRow);

    const chips = element("div", "summary");
    this.chips = [
      summaryChip("mdi:clock-outline", "last_contact_entity"),
      summaryChip("mdi:battery", "battery_level_entity"),
    ];
    chips.append(...this.chips.map(({ node }) => node));
    header.append(titleGroup, reading, chips);

    this.controls = element("div", "chart-controls");
    this.controls.setAttribute("role", "group");
    this.temperatureButton = element("button", "toggle");
    this.temperatureButton.type = "button";
    this.temperatureButton.dataset.chart = "temperature";
    this.temperatureLabel = element("span");
    this.temperatureButton.append(icon("mdi:thermometer"), this.temperatureLabel);
    this.temperatureButton.addEventListener("click", () => this.toggleTemperature());
    const charts = element("div", "charts");
    for (const key of CHARTS) {
      const button = element("button", "toggle");
      button.type = "button";
      button.dataset.chart = key;
      const buttonText = element("span");
      button.append(icon(chartIcons[key]), buttonText);
      button.addEventListener("click", () => this.toggleChart(key));
      this.controls.append(button);
      if (key === "hourly") this.controls.append(this.temperatureButton);

      const section = element("section", "chart");
      section.dataset.chart = key;
      const heading = element("h3");
      const subtitle = element("p", "subtitle");
      const head = element("div", "chart-heading");
      const chartGlyph = element("span", "glyph");
      chartGlyph.append(icon(chartIcons[key]));
      const copy = element("div");
      copy.append(heading, subtitle);
      head.append(chartGlyph, copy);
      const status = element("p", "status");
      status.setAttribute("role", "status");
      const plot = new Plot(key);
      const note = element("p", "note");
      note.hidden = key !== "hourly";
      section.append(head, status, plot.node, note);
      const temperatureStatus = key === "hourly" ? element("p", "status") : null;
      if (temperatureStatus) {
        temperatureStatus.setAttribute("role", "status");
        temperatureStatus.hidden = true;
        section.append(temperatureStatus);
      }
      charts.append(section);
      this.views.set(key, { button, buttonText, section, heading, subtitle, status, plot, note, temperatureStatus });
    }
    content.append(header, this.controls, charts);
    card.append(content);
    this.shadowRoot.append(style, card);
  }

  static async getConfigElement() {
    await loadEditorForm();
    return document.createElement(CARD_TYPE + "-editor");
  }

  static getStubConfig(hass) {
    const config = { type: "custom:" + CARD_TYPE };
    const example = [
      "sensor.garden_gas_reader", "sensor.garden_gas_consumption", "sensor.garden_gas_reader_last_contact",
      "sensor.garden_gas_reader_battery_level_estimated", "sensor.garden_gas_reader_battery_voltage",
    ];
    for (const [index, field] of FIELDS.entries()) {
      if (hass?.states?.[example[index]]) config[field] = example[index];
    }
    return config;
  }

  getCardSize() {
    const chartRows = 4 * CHARTS.filter((key) => this._config?.charts[key] !== false).length;
    return 3 + chartRows;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  setConfig(config) {
    this._config = normalizeConfig(config);
    this._visible = { ...this._config.charts };
    this.resetCharts();
    this.update();
  }

  set hass(hass) {
    this._hass = hass;
    this.update();
  }

  connectedCallback() {
    for (const { plot } of this.views.values()) plot.connect();
    this.update();
  }

  disconnectedCallback() {
    this.resetCharts();
    for (const { plot } of this.views.values()) plot.disconnect();
    this.scope = undefined;
  }

  resetCharts() {
    clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
    for (const view of this.views.values()) {
      view.result = undefined;
      view.request = undefined;
    }
  }

  update() {
    if (!this.isConnected || !this._config || !this._hass) return;
    const hass = this._hass;
    const zone = hass.config?.time_zone || "UTC";
    const connection = hass.connection ?? hass.callWS;
    if (!this.scope || this.scope.zone !== zone || this.scope.connection !== connection) {
      this.resetCharts();
      this.scope = { zone, connection };
    }
    this.renderSummary();
    this.renderCharts();
    this.refresh(true);
    if (!this.refreshTimer) this.refreshTimer = setInterval(() => this.refresh(), refreshInterval);
  }

  renderSummary() {
    const hass = this._hass;
    const config = this._config;
    const text = labels(hass);
    const locale = localeFor(hass);
    theme(this, hass);
    this.titleHeading.textContent = config.title?.trim() || text.title;
    const meter = hass.states?.[config.meter_entity];
    const reading = numeric(meter?.state);
    this.readingLabel.textContent = text.meter_entity;
    this.readingValue.textContent = reading === null ? "—" :
      new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(reading);
    this.readingUnit.textContent = reading === null ? "" : meter.attributes?.unit_of_measurement || "m³";

    for (const { node, field, label, value } of this.chips) {
      label.textContent = text[field];
      const state = hass.states?.[config[field]]?.state;
      if (field === "last_contact_entity") {
        const time = Date.parse(state);
        value.textContent = Number.isFinite(time)
          ? new Intl.DateTimeFormat(locale, {
            dateStyle: "medium", timeStyle: "short", timeZone: this.scope.zone,
          }).format(time)
          : "—";
      } else {
        const battery = numeric(state);
        const available = battery !== null && battery >= 0 && battery <= 100;
        node.dataset.level = available ? (battery <= 20 ? "low" : "good") : "unknown";
        node.style.setProperty("--battery-fill", available ? battery + "%" : "0%");
        value.textContent = available
          ? new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(battery / 100)
          : "—";
      }
    }
  }

  renderCharts() {
    const text = labels(this._hass);
    const locale = localeFor(this._hass);
    this.controls.setAttribute("aria-label", text.charts);
    const temperatureId = this._config.temperature_entity;
    const temperatureVisible = Boolean(temperatureId && this._visible.temperature);
    this.temperatureButton.hidden = !temperatureId;
    this.temperatureButton.disabled = !this._visible.hourly;
    this.temperatureButton.setAttribute("aria-pressed", String(temperatureVisible && this._visible.hourly));
    this.temperatureLabel.textContent = text.temperature;
    for (const [key, view] of this.views) {
      const visible = this._visible[key];
      const id = sourceFor(key, this._config);
      const unit = this._hass.states?.[id]?.attributes?.unit_of_measurement || (key === "voltage" ? "V" : "m³");
      view.button.setAttribute("aria-pressed", String(visible));
      view.button.setAttribute("aria-label", text[key]);
      view.buttonText.textContent = text[key + "Short"];
      view.section.hidden = !visible;
      if (!visible) continue;
      view.heading.textContent = text[key];
      view.subtitle.textContent = text[key + "Range"] + " · " + unit;
      if (key === "hourly") view.note.textContent = text.reportNote;
      const { points, error, temperatureError } = view.result ?? {};
      const showTemperature = key === "hourly" && temperatureVisible;
      const temperatureUnit = showTemperature
        ? this._hass.states?.[temperatureId]?.attributes?.unit_of_measurement ?? ""
        : null;
      const hasGas = points?.some(({ value }) => value !== null);
      const hasTemperature = showTemperature && points?.some(({ temperature }) => Number.isFinite(temperature));
      const ready = hasGas || hasTemperature;
      if (view.temperatureStatus) {
        const message = !showTemperature || !view.result ? "" : temperatureError ? text.temperatureError :
          view.result.temperatureRequested && !hasTemperature ? text.temperatureEmpty : "";
        view.temperatureStatus.textContent = message;
        view.temperatureStatus.hidden = !message;
      }
      view.plot.node.hidden = !ready;
      view.status.hidden = Boolean(hasGas || (ready && !error));
      if (ready) {
        const appearance = JSON.stringify([locale, unit, temperatureUnit, this.scope.zone, this.dataset.themeMode, this._hass.selectedTheme]);
        if (view.plot.points !== points || view.appearance !== appearance) {
          view.plot.setData(points, unit, locale, this.scope.zone, text, temperatureUnit);
          view.appearance = appearance;
        }
      }
      view.status.textContent = !id ? text.configure : error || typeof this._hass.callWS !== "function" ? text.error : points ? text.empty : text.loading;
    }
  }

  toggleChart(key) {
    this._visible[key] = !this._visible[key];
    const view = this.views.get(key);
    view.request = undefined;
    view.result = undefined;
    this.renderCharts();
    this.refresh(true);
  }

  toggleTemperature() {
    this._visible.temperature = !this._visible.temperature;
    this.renderCharts();
    if (this._visible.temperature) {
      // Refresh both series against the same time buckets.
      this.views.get("hourly").request = undefined;
      this.refresh(false, "hourly");
    }
  }

  refresh(initial = false, onlyChart) {
    if (typeof this._hass.callWS !== "function") return;
    let dates;
    for (const [key, view] of this.views) {
      if (onlyChart && key !== onlyChart) continue;
      const id = sourceFor(key, this._config);
      const temperatureId = key === "hourly" && this._visible.temperature ? this._config.temperature_entity : undefined;
      if (!this._visible[key] || (!id && !temperatureId) || view.request || (initial && view.result)) continue;
      dates ??= calendar(this.scope.zone, Date.now());
      const series = key === "hourly"
        ? this.loadHourly(id, temperatureId, dates)
        : fetchSeries(this._hass, key, id, dates).then((points) => ({ points }));
      this.loadChart(key, view, series);
    }
  }

  async loadHourly(id, temperatureId, dates) {
    const hass = this._hass;
    const [gas, temperature] = await Promise.allSettled([
      id ? fetchSeries(hass, "hourly", id, dates) : undefined,
      temperatureId ? fetchHistory(hass, temperatureId, dates) : [],
    ]);
    const points = gas.value ?? dates.hourly.map((bucket) => ({ ...bucket, value: null }));
    if (temperatureId) {
      const values = hourlyTemperature(dates.hourly, temperature.value ?? [], dates.now);
      points.forEach((point, index) => { point.temperature = values[index]; });
    }
    return {
      points,
      error: gas.status === "rejected",
      temperatureRequested: Boolean(temperatureId),
      temperatureError: temperature.status === "rejected",
    };
  }

  async loadChart(key, view, series) {
    const request = Symbol(key);
    view.request = request;
    let result;
    try {
      result = await series;
    } catch {
      result = { error: true };
    }
    if (view.request !== request) return;
    view.result = result;
    view.request = undefined;
    this.renderCharts();
  }
}

if (!customElements.get(CARD_TYPE)) customElements.define(CARD_TYPE, GasMeterCard);
if (!customElements.get(CARD_TYPE + "-editor")) customElements.define(CARD_TYPE + "-editor", GasMeterEditor);

window.customCards ??= [];
if (!window.customCards.some(({ type }) => type === CARD_TYPE)) {
  window.customCards.push({
    type: CARD_TYPE,
    name: "Gas Meter Card",
    description: "Gas meter reading, battery and interactive consumption charts.",
    preview: true,
  });
}
