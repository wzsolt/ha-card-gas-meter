import { buildCostView, costEnabled, costOptions, fetchClosedDays, fetchTodayVolume } from "./cost.js";
import { element, icon } from "./dom.js";
import { Plot } from "./plot.js";

const periods = ["daily", "monthly", "yearly"];
const historyLifetime = 60 * 60_000;

export class CostPanel {
  constructor(toggle) {
    this.visible = true;
    this.period = "daily";
    this.button = element("button", "toggle");
    this.button.type = "button";
    this.button.dataset.chart = "cost";
    this.buttonText = element("span");
    this.button.append(icon("mdi:cash"), this.buttonText);
    this.button.addEventListener("click", () => {
      this.visible = !this.visible;
      if (!this.visible) this.request = undefined;
      toggle();
    });
    this.node = element("section", "chart cost-panel");
    this.node.dataset.chart = "cost";
    this.node.hidden = true;
    this.button.hidden = true;

    const heading = element("div", "chart-heading");
    const glyph = element("span", "glyph");
    glyph.append(icon("mdi:cash"));
    this.heading = element("h3");
    heading.append(glyph, this.heading);

    this.summary = element("dl", "cost-summary");
    this.controls = element("div", "cost-controls");
    this.controls.setAttribute("role", "group");
    this.periodButtons = new Map(periods.map((period) => {
      const button = element("button", "toggle");
      button.type = "button";
      button.dataset.period = period;
      button.addEventListener("click", () => {
        this.period = period;
        this.plot.select(null);
        this.render(this.context);
      });
      this.controls.append(button);
      return [period, button];
    }));
    this.plot = new Plot("cost");
    this.status = element("p", "status");
    this.status.setAttribute("role", "status");
    this.note = element("p", "note");
    this.node.append(heading, this.summary, this.controls, this.plot.node, this.status, this.note);
  }

  reset() {
    this.result = undefined;
    this.request = undefined;
    this.history = undefined;
  }

  render(context) {
    this.context = context;
    const { hass, config, text, locale, zone, themeMode } = context;
    const enabled = costEnabled(config.cost);
    this.button.hidden = !enabled;
    this.button.setAttribute("aria-label", text.cost);
    this.button.setAttribute("aria-pressed", String(enabled && this.visible));
    this.buttonText.textContent = text.costShort;
    this.node.hidden = !enabled || !this.visible;
    if (this.node.hidden) return;

    this.heading.textContent = text.cost;
    this.controls.setAttribute("aria-label", text.costPeriod);
    this.note.textContent = text.costEstimate;
    for (const [period, button] of this.periodButtons) {
      button.setAttribute("aria-pressed", String(period === this.period));
      button.textContent = text["cost_" + period];
    }
    const issue = this.configIssue(hass, config) ?? this.result?.dateIssue;
    const view = issue ? undefined : this.result?.view;
    const points = view?.[this.period];
    const hasData = Boolean(points?.some(({ value }) => value !== null));
    this.plot.node.hidden = !hasData;
    this.controls.hidden = !view;
    this.summary.hidden = !view;
    const warning = view?.summary.costYear?.uncertain ? text.costUncertain :
      this.result?.closedFailed ? text.costHistoryError : "";
    this.status.textContent = issue ? text[issue] :
      !view ? text.loading :
      !hasData && this.result?.failed ? text.error :
      !hasData ? text.empty : warning;
    this.status.hidden = !this.status.textContent;
    const appearance = JSON.stringify([locale, zone, themeMode, hass.selectedTheme]);
    if (!view || (view === this.renderedView && this.renderedPeriod === this.period &&
        this.appearance === appearance)) return;

    this.renderedView = view;
    this.renderedPeriod = this.period;
    this.appearance = appearance;
    const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const currency = (value) => amount.format(Math.round(value) || 0) + " Ft";
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
    const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
    const shortMonth = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
    const shortDay = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
    const dateRange = ({ key, end }) => date.formatRange(key, end - 86_400_000);
    const flags = (point) => [
      point.incomplete && text.costIncomplete,
      point.uncertain && text.costUncertainShort,
      point.delayed && text.costDelayed,
    ].filter(Boolean);

    this.summary.replaceChildren(...Object.entries(view.summary).map(([key, point]) => {
      const item = element("div", "cost-total");
      const label = element("dt", "", text[key]);
      const value = element("dd", "", point?.value == null ? "—" : currency(point.value));
      const details = point ? flags(point) : [];
      if (key === "costBilling") details.unshift(date.format(point.key));
      item.append(label, value);
      if (details.length) item.append(element("dd", "subtitle", details.join(" · ")));
      return item;
    }));
    if (!hasData) return;

    const chartPeriod = this.period;
    this.plot.setData(points, "Ft", locale, zone, text, {
      label: text.cost + " · " + text["cost_" + chartPeriod],
      signed: true,
      compactAxis: true,
      tick: (point) => chartPeriod === "yearly"
        ? new Date(point.key).getUTCFullYear() + "/" + String(new Date(point.end).getUTCFullYear()).slice(-2)
        : (chartPeriod === "monthly" ? shortMonth : shortDay).format(point.key),
      period: (point) => chartPeriod === "yearly" ? dateRange(point) :
        (chartPeriod === "monthly" ? month : date).format(point.key),
      value: (point) => [
        currency(point.value),
        text.costDiscount + " " + currency(point.discounted),
        text.costMarket + " " + currency(point.market),
        text.costBase + " " + currency(point.base),
        Math.round(point.correction) !== 0 && text.costCorrection + " " + currency(point.correction),
        ...flags(point),
      ].filter(Boolean).join(" · "),
    });
  }

  configIssue(hass, config) {
    if (!costOptions(config.cost)) return "costSettings";
    if (!config.consumption_entity) return "configure";
    const state = hass.states?.[config.consumption_entity];
    if (!state) return "costSensor";
    if (!["m³", "m3"].includes(state.attributes?.unit_of_measurement)) return "costUnit";
    if (typeof hass.callWS !== "function") return "error";
  }

  needsRefresh(initial, hass, config) {
    return this.visible && !this.request && (!initial || !this.result) && !this.configIssue(hass, config);
  }

  refresh(hass, config, dates, hourly) {
    const options = costOptions(config.cost);
    if (!options) return;
    const dateIssue = options.effective > dates.today ? "costFuture" :
      options.opening?.start > dates.today ? "costOpeningFuture" : undefined;
    if (dateIssue) {
      this.result = { dateIssue };
      this.render(this.context);
      return;
    }
    this.load(hass, config.consumption_entity, dates, options, hourly);
  }

  async load(hass, id, dates, options, hourly) {
    const request = Symbol("cost");
    this.request = request;
    const cached = this.history?.today === dates.today &&
      dates.now - this.history.at < historyLifetime ? this.history.volumes : null;
    const [closed, current] = await Promise.allSettled([
      cached ?? fetchClosedDays(hass, id, dates, options),
      fetchTodayVolume(hass, id, dates, hourly),
    ]);
    if (this.request !== request) return;
    this.request = undefined;
    if (!cached && closed.status === "fulfilled") {
      this.history = { today: dates.today, at: dates.now, volumes: closed.value };
    }
    const volumes = new Map(closed.status === "fulfilled" ? closed.value : undefined);
    const latest = current.status === "fulfilled" ? current.value : undefined;
    if (Number.isFinite(latest?.volume)) volumes.set(dates.today, latest.volume);
    this.result = {
      view: buildCostView(volumes, dates.today, options, latest?.delayed),
      failed: closed.status === "rejected" || current.status === "rejected",
      closedFailed: closed.status === "rejected",
    };
    this.render(this.context);
  }
}
