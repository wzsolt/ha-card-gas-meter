import { costDefaults, costEnabled, costNumberFields } from "./cost.js";
import { CHARTS, FIELDS, normalizeConfig, numeric } from "./data.js";
import { element } from "./dom.js";
import { labels } from "./text.js";

export async function loadEditorForm() {
  if (customElements.get("ha-form")) return;
  const helpers = await window.loadCardHelpers?.();
  if (helpers && !customElements.get("hui-entities-card")) {
    await helpers.createCardElement({ type: "entities", entities: [] });
  }
  await customElements.get("hui-entities-card")?.getConfigElement?.();
}

export class GasMeterEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.form = element("ha-form");
    this.shadowRoot.append(this.form);
    this.form.addEventListener("value-changed", (event) => {
      event.stopPropagation();
      this.change(event.detail.value);
    });
  }

  setConfig(config) {
    this.config = normalizeConfig(config);
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  render() {
    if (!this.config || !this._hass) return;
    const text = labels(this._hass);
    this.form.hass = this._hass;
    if (this.text !== text) {
      this.text = text;
      this.form.computeLabel = ({ name }) => text[name.replace("show_", "")] || name;
      this.form.computeHelper = ({ name }) => name === "monthly_weights" ? text.monthlyWeightsHelp : undefined;
      this.form.schema = [
        { name: "title", selector: { text: {} } },
        ...FIELDS.map((name) => ({ name, selector: { entity: { filter: { domain: "sensor" } } } })),
        ...CHARTS.map((key) => ({ name: "show_" + key, selector: { boolean: {} } })),
        {
          name: "cost", type: "expandable", title: text.cost, icon: "mdi:cash",
          schema: [
            { name: "enabled", selector: { boolean: {} } },
            { name: "effective_from", selector: { date: {} } },
            { name: "billing_period_start", selector: { date: {} } },
            ...costNumberFields.map((name) => ({
              name, default: costDefaults[name], selector: { number: { mode: "box", min: 0, step: "any" } },
            })),
            { name: "monthly_weights", selector: { text: {} } },
          ],
        },
      ];
    }
    if (this.renderedConfig !== this.config) {
      const { title, charts, cost } = this.config;
      const costData = { ...cost, enabled: costEnabled(cost) };
      if (Array.isArray(costData.monthly_weights)) {
        costData.monthly_weights = costData.monthly_weights.join(", ");
      }
      this.form.data = {
        title, cost: costData,
        ...Object.fromEntries(FIELDS.map((name) => [name, this.config[name]])),
        ...Object.fromEntries(CHARTS.map((key) => ["show_" + key, charts[key]])),
      };
      this.renderedConfig = this.config;
    }
  }

  change(data) {
    const next = { ...this.config };
    delete next.animate_meter;
    for (const field of ["title", ...FIELDS]) {
      if (data[field]?.trim()) next[field] = data[field].trim();
      else delete next[field];
    }
    next.charts = Object.fromEntries(CHARTS.map((key) => [key, data["show_" + key] !== false]));
    const cost = { ...data.cost };
    for (const key of Object.keys(cost)) {
      if (cost[key] === "" || cost[key] == null) delete cost[key];
    }
    if (typeof cost.monthly_weights === "string") {
      const weights = cost.monthly_weights.split(",").map(numeric);
      if (weights.length === 12 && weights.every((value) => value !== null)) cost.monthly_weights = weights;
    }
    if (this.config.cost || cost.enabled || Object.keys(cost).some((key) => key !== "enabled")) {
      next.cost = cost;
    }
    this.config = next;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: next }, bubbles: true, composed: true,
    }));
  }
}
