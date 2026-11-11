import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { parse } from "yaml";

const bundle = fileURLToPath(new URL("../dist/ha-card-gas-meter.js", import.meta.url));
const config = parse(await readFile(new URL("../examples/garden-gas-meter.yaml", import.meta.url), "utf8"));
const tag = "ha-card-gas-meter";
const fixedTime = Date.parse("2026-11-11T09:45:00Z");
const hour = 3_600_000;

async function mount(page, config, dark = true) {
  await page.clock.install({ time: fixedTime });
  await page.setContent('<style>body { margin: 12px; font: 16px system-ui; }</style><main></main>');
  await page.evaluate(() => {
    customElements.define("ha-card", class extends HTMLElement {});
    customElements.define("ha-icon", class extends HTMLElement {});
    window.loadCardHelpers = async () => ({
      async createCardElement() {
        customElements.define("hui-entities-card", class extends HTMLElement {
          static async getConfigElement() {
            customElements.define("ha-form", class extends HTMLElement {
              edit(field, value) {
                const path = Array.isArray(field) ? field : [field];
                let schema = this.schema;
                const data = structuredClone(this.data);
                let target = data;
                for (const name of path.slice(0, -1)) {
                  schema = schema.find((item) => item.name === name)?.schema;
                  target = target[name] ??= {};
                }
                if (!schema?.some(({ name }) => name === path.at(-1))) throw new Error("Missing field");
                target[path.at(-1)] = value;
                this.data = data;
                this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: this.data }, bubbles: true }));
              }
            });
          }
        });
      },
    });
  });
  await page.addScriptTag({ path: bundle, type: "module" });
  await page.evaluate((tag) => customElements.whenDefined(tag).then(() => undefined), tag);
  await page.evaluate(({ tag, config, dark, hour }) => {
    const entities = [
      [config.meter_entity, "4223.532", "m³"],
      [config.consumption_entity, "155.90", "m³"],
      [config.last_contact_entity, "2026-11-11T09:25:00+00:00"],
      [config.battery_level_entity, "87", "%"],
      [config.battery_voltage_entity, "4.074", "V"],
    ];
    window.calls = [];
    window.hass = {
      config: { time_zone: "Europe/Budapest" },
      locale: { language: "hu-HU" },
      themes: { darkMode: dark },
      states: Object.fromEntries(entities.map(([id, state, unit]) => [id, { state, attributes: { unit_of_measurement: unit } }])),
      callWS: async (request) => {
        window.calls.push(request);
        const start = Date.parse(request.start_time);
        if (request.type === "history/history_during_period") {
          return { [request.entity_ids[0]]: [
            { s: "154", lu: start / 1000 },
            { s: "154.25", lc: (start + 1000 + 0.5 * hour) / 1000 },
            { s: "155.9", lc: (start + 1000 + 10.5 * hour) / 1000 },
          ] };
        }
        const [id] = request.statistic_ids;
        const [field] = request.types;
        if (window.failVoltage && field === "mean") throw new Error("Recorder unavailable");
        if (request.period === "day" && field === "change" &&
            start === Date.parse("2026-07-31T22:00:00Z")) {
          const rows = [];
          for (let day = Date.UTC(2026, 7, 1); day < Date.UTC(2026, 10, 11); day += 24 * hour) {
            const offset = day < Date.UTC(2026, 9, 26) ? 2 : 1;
            const change = day === Date.UTC(2026, 10, 9) ? 10 : day === Date.UTC(2026, 10, 10) ? 0 : 1;
            rows.push({ start: day - offset * hour, change });
          }
          return { [id]: rows };
        }
        const rows = request.period === "month"
          ? [{ start, change: 42.3 }, { start: Date.parse("2026-10-31T23:00:00Z"), change: 21.4 }]
          : [{ start, [field]: field === "mean" ? 4.074 : 3.2 },
            { start: Date.parse("2026-11-10T23:00:00Z"), [field]: field === "mean" ? 4.05 : 1.9 }];
        return { [id]: rows };
      },
    };
    const card = document.createElement(tag);
    card.setConfig(config);
    card.hass = window.hass;
    document.querySelector("main").append(card);
  }, { tag, config, dark, hour });
}

test("four charts support pointer and keyboard, independent settings and battery fill", { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.GAS_METER_CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 880, height: 850 }, colorScheme: "dark" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error));
    await mount(page, config);
    const card = page.locator(tag);
    await card.locator('section[data-chart="voltage"] canvas').waitFor();
    assert.equal(await card.locator(".chart:visible").count(), 4);
    assert.match(await card.locator(".reading-row").innerText(), /4\s?223,532\s*m³/);
    assert.match(await card.locator(".last_contact_entity").innerText(), /10:25/);
    const battery = card.locator(".battery_level_entity");
    assert.match(await battery.innerText(), /87\s?%/);
    assert.match(await battery.evaluate((badge) => getComputedStyle(badge).backgroundImage), /87%/);
    for (const [state, fill, label] of [["100", "100%", /100\s?%/], ["0", "0%", /0\s?%/], ["unavailable", "none", /—/]]) {
      await page.evaluate(({ tag, id, state }) => {
        hass.states[id] = { ...hass.states[id], state };
        document.querySelector(tag).hass = hass;
      }, { tag, id: config.battery_level_entity, state });
      assert.match(await battery.innerText(), label);
      assert.match(await battery.evaluate((badge) => getComputedStyle(badge).backgroundImage), new RegExp(fill));
    }
    assert.equal(await card.getAttribute("data-theme-mode"), "dark");
    assert.equal(await card.locator(".charts").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length), 2);

    const checks = { hourly: /00:00 · 0,25 m³/, daily: /3,2 m³/, monthly: /42,3 m³/, voltage: /4,074 V/ };
    for (const [key, expected] of Object.entries(checks)) {
      const section = card.locator('section[data-chart="' + key + '"]');
      await section.locator("canvas").hover({ position: { x: 48, y: 50 } });
      assert.match(await section.locator(".readout").innerText(), expected);
      await section.locator(".plot").focus();
      await page.keyboard.press("Home");
      assert.match(await section.locator(".readout").innerText(), expected);
      await page.keyboard.press("End");
      assert.notEqual(await section.locator(".readout").innerText(), "");
    }
    assert.match(await card.locator('section[data-chart="voltage"] .readout').innerText(), /4,05 V · folyamatban/);
    assert.equal(await page.evaluate(() => calls.length), 4);
    const buttons = card.locator(".chart-controls .toggle:visible");
    for (const button of await buttons.all()) {
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "false");
    }
    assert.equal(await card.locator(".chart:visible").count(), 0);
    await page.clock.fastForward(5 * 60_000);
    assert.equal(await page.evaluate(() => calls.length), 4);
    await buttons.first().click();
    await card.locator('section[data-chart="hourly"] canvas').waitFor();
    assert.equal(await page.evaluate(() => calls.length), 5);

    await page.evaluate(({ tag, id }) => {
      hass.states[id] = { ...hass.states[id], state: "5000.002" };
      document.querySelector(tag).hass = hass;
    }, { tag, id: config.meter_entity });
    assert.match(await card.locator(".reading-row").innerText(), /^5\s?000,002\s*m³$/);
    assert.equal(await page.evaluate(() => calls.length), 5);
    await card.locator('section[data-chart="hourly"] .plot').focus();
    await page.keyboard.press("Home");
    assert.match(await card.locator('section[data-chart="hourly"] .readout').innerText(), /0,25 m³/);

    const saved = await page.evaluate(async ({ tag, config }) => {
      const card = document.querySelector(tag);
      const editor = await card.constructor.getConfigElement();
      editor.hass = hass;
      editor.setConfig({ ...config, animate_meter: true });
      document.body.append(editor);
      let next;
      editor.addEventListener("config-changed", ({ detail }) => { next = detail.config; });
      const form = editor.shadowRoot.querySelector("ha-form");
      form.edit("show_voltage", false);
      card.setConfig(next);
      return next;
    }, { tag, config });
    assert.equal(saved.charts.voltage, false);
    assert.equal("animate_meter" in saved, false);
    assert.equal(saved.consumption_entity, config.consumption_entity);
    assert.equal(await card.locator('section[data-chart="voltage"]').isHidden(), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("narrow light layout, touch inspection and Recorder failure", { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.GAS_METER_CHROMIUM });
  try {
    const page = await browser.newPage({
      viewport: { width: 335, height: 790 }, colorScheme: "light", hasTouch: true,
    });
    const settings = { ...config, title: undefined, charts: { daily: true, hourly: false, monthly: false, voltage: false } };
    await mount(page, settings, false);
    const card = page.locator(tag);
    await card.locator('section[data-chart="daily"] canvas').waitFor();
    assert.equal(await card.getAttribute("data-theme-mode"), "light");
    assert.equal(await card.locator(".charts").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 335);
    assert.equal(await card.locator("h2").textContent(), "Gázmérő");
    await card.locator('section[data-chart="daily"] canvas').tap({ position: { x: 48, y: 50 } });
    assert.match(await card.locator('section[data-chart="daily"] .readout').innerText(), /3,2 m³/);
    await page.evaluate(({ tag, id }) => {
      window.failVoltage = true;
      hass.locale = { language: "en" };
      hass.states[id] = { ...hass.states[id], state: "4224.1" };
      document.querySelector(tag).hass = hass;
    }, { tag, id: config.meter_entity });
    assert.equal(await card.locator("h2").textContent(), "Gas meter");
    await card.getByRole("button", { name: "Battery voltage" }).tap();
    await card.getByText("Could not load Recorder data.").waitFor();
    assert.match(await card.locator(".reading-value").textContent(), /4,224\.100/);
  } finally {
    await browser.close();
  }
});

test("MVM cost editor, billing summary and interactive daily, monthly and gas-year views", { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.GAS_METER_CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 520, height: 760 }, hasTouch: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error));
    const curve = "31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31";
    const settings = {
      ...config, charts: { hourly: true, daily: false, monthly: false, voltage: false },
      cost: { enabled: false },
    };
    await mount(page, settings);
    const card = page.locator(tag);
    const panel = card.locator(".cost-panel");
    assert.equal(await panel.isHidden(), true);
    assert.equal(await page.evaluate(() => calls.length), 1);

    const saved = await page.evaluate(async ({ tag, curve, settings }) => {
      const card = document.querySelector(tag);
      const editor = await card.constructor.getConfigElement();
      editor.hass = hass;
      editor.setConfig(settings);
      document.body.append(editor);
      let next;
      editor.addEventListener("config-changed", ({ detail }) => { next = detail.config; });
      const form = editor.shadowRoot.querySelector("ha-form");
      for (const [field, value] of Object.entries({
        enabled: true, effective_from: "2026-08-01", billing_period_start: "2026-11-04",
        discounted_ft_per_mj: 2, market_ft_per_mj: 10, heating_value_mj_per_m3: 1,
        correction_factor: 1, annual_allowance_mj: 365, base_ft_per_year: 0,
        monthly_weights: curve,
      })) {
        form.edit(["cost", field], value);
      }
      card.setConfig(next);
      return next;
    }, { tag, curve, settings });
    assert.deepEqual(saved.cost.monthly_weights, curve.split(", ").map(Number));
    assert.equal(saved.cost.billing_period_start, "2026-11-04");
    assert.equal(saved.cost.enabled, true);
    await panel.locator("canvas").waitFor();
    const totals = panel.locator(".cost-total");
    for (const [index, expected] of [[0, "11 Ft"], [1, "111 Ft"], [2, "295 Ft"], [3, "105 Ft"]]) {
      assert.equal(await totals.nth(index).locator("dd").first().textContent(), expected);
    }
    assert.equal(await page.evaluate(() => calls.filter((message) =>
      message.type === "history/history_during_period").length), 2);

    const plot = panel.locator(".plot");
    const detail = panel.locator(".readout");
    await plot.focus();
    await page.keyboard.press("End");
    assert.match(await detail.textContent(), /11 Ft.*Kereten túli díj 19 Ft.*Becsült sávkorrekció -8 Ft/);
    await page.keyboard.press("ArrowLeft");
    assert.match(await detail.textContent(), /-8 Ft.*Alapdíj 0 Ft.*Becsült sávkorrekció -8 Ft/);
    await panel.getByRole("button", { name: "12 hónap" }).click();
    await plot.focus();
    await page.keyboard.press("End");
    assert.match(await detail.textContent(), /november.*111 Ft/);
    await panel.getByRole("button", { name: "Kedvezményes évek" }).tap();
    await plot.focus();
    await page.keyboard.press("End");
    assert.match(await detail.textContent(), /2026.*2027.*295 Ft/);

    await card.getByRole("button", { name: "Becsült gázköltség" }).click();
    assert.equal(await panel.isHidden(), true);
    const closedBefore = await page.evaluate(() => calls.filter(({ period }) => period === "day").length);
    await page.clock.fastForward(5 * 60_000);
    assert.equal(await page.evaluate(() => calls.filter(({ period }) => period === "day").length), closedBefore);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
