import { CHARTS, FIELDS, normalizeConfig } from "./data.js";
import { element } from "./dom.js";
import { labels } from "./text.js";

const switches = [...CHARTS, "temperature"];

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
      this.form.schema = [
        { name: "title", selector: { text: {} } },
        ...FIELDS.map((name) => {
          const filter = name === "temperature_entity"
            ? { domain: "sensor", device_class: "temperature" }
            : { domain: "sensor" };
          return { name, selector: { entity: { filter } } };
        }),
        ...switches.map((key) => ({ name: "show_" + key, selector: { boolean: {} } })),
      ];
    }
    if (this.renderedConfig !== this.config) {
      const { title, charts } = this.config;
      this.form.data = {
        title,
        ...Object.fromEntries(FIELDS.map((name) => [name, this.config[name]])),
        ...Object.fromEntries(switches.map((key) => ["show_" + key, charts[key]])),
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
    next.charts = Object.fromEntries(switches.map((key) => [key, data["show_" + key] !== false]));
    this.config = next;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: next }, bubbles: true, composed: true,
    }));
  }
}
