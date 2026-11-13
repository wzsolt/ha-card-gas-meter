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
const fiveMinutes = 300_000;

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
  await page.evaluate(({ tag, config, dark, fiveMinutes }) => {
    const entities = [
      [config.meter_entity, "4223.532", "m³"],
      [config.consumption_entity, "155.90", "m³"],
      [config.last_contact_entity, "2026-11-11T09:25:00+00:00"],
      [config.battery_level_entity, "87", "%"],
      [config.battery_voltage_entity, "4.074", "V"],
      ...(config.temperature_entity ? [[config.temperature_entity, "-2", "°C"]] : []),
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
          if (request.entity_ids[0] === config.temperature_entity) {
            if (window.failTemperature) throw new Error("Temperature history unavailable");
            return { [config.temperature_entity]: [
              { s: "-2", lu: start / 1000 },
              { s: "6", lc: (Date.parse(request.end_time) - fiveMinutes) / 1000 },
            ] };
          }
          return { [request.entity_ids[0]]: [
            { s: "154", lu: start / 1000 },
            { s: "154.25", lc: (start + 1000 + fiveMinutes) / 1000 },
            { s: "155.9", lc: (Date.parse(request.end_time) - fiveMinutes) / 1000 },
          ] };
        }
        const [id] = request.statistic_ids;
        const [field] = request.types;
        if (window.failVoltage && field === "mean") throw new Error("Recorder unavailable");
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
  }, { tag, config, dark, fiveMinutes });
}

test("four charts support pointer and keyboard, independent settings and battery fill", { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.GAS_METER_CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 880, height: 850 }, colorScheme: "dark" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error));
    await mount(page, { ...config, cost: { enabled: true } });
    const card = page.locator(tag);
    await card.locator('section[data-chart="voltage"] canvas').waitFor();
    assert.equal(await card.locator(".chart:visible").count(), 4);
    assert.equal(await card.getByRole("button", { name: "Hőmérséklet" }).count(), 0);
    assert.equal(await card.locator(".cost-panel").count(), 0);
    assert.match(await card.locator(".reading-row").innerText(), /4\s?223,532\s*m³/);
    assert.match(await card.locator(".last_contact_entity").innerText(), /10:25/);
    const battery = card.locator(".battery_level_entity");
    assert.match(await battery.innerText(), /87\s?%/);
    assert.match(await battery.evaluate((badge) => getComputedStyle(badge).backgroundImage), /87%/);
    for (const [state, fill, label] of [["100", "100%", /100\s?%/], ["0", "0%", /0\s?%/], ["unavailable", "none", /—/]]) {
      await page.evaluate(({ tag, id, state }) => {
        window.hass.states[id] = { ...window.hass.states[id], state };
        document.querySelector(tag).hass = window.hass;
      }, { tag, id: config.battery_level_entity, state });
      assert.match(await battery.innerText(), label);
      assert.match(await battery.evaluate((badge) => getComputedStyle(badge).backgroundImage), new RegExp(fill));
    }
    assert.equal(await card.getAttribute("data-theme-mode"), "dark");
    assert.equal(await card.locator(".charts").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length), 2);

    assert.match(await card.locator('section[data-chart="hourly"] .subtitle').textContent(), /Elmúlt 24 óra/);
    const checks = { hourly: /nov\. 10\. 10:45 · 0,25 m³/, daily: /3,2 m³/, monthly: /42,3 m³/, voltage: /4,074 V/ };
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
    const hourly = card.locator('section[data-chart="hourly"]');
    await hourly.locator(".plot").focus();
    await page.keyboard.press("End");
    assert.match(await hourly.locator(".readout").innerText(), /nov\. 11\. 10:00 · 1,65 m³ · folyamatban/);
    assert.equal(await page.evaluate(() => window.calls.length), 4);
    const buttons = card.locator(".chart-controls .toggle:visible");
    for (const button of await buttons.all()) {
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "false");
    }
    assert.equal(await card.locator(".chart:visible").count(), 0);
    await page.clock.fastForward(5 * 60_000);
    assert.equal(await page.evaluate(() => window.calls.length), 4);
    await buttons.first().click();
    await card.locator('section[data-chart="hourly"] canvas').waitFor();
    assert.equal(await page.evaluate(() => window.calls.length), 5);

    await page.evaluate(({ tag, id }) => {
      window.hass.states[id] = { ...window.hass.states[id], state: "5000.002" };
      document.querySelector(tag).hass = window.hass;
    }, { tag, id: config.meter_entity });
    assert.match(await card.locator(".reading-row").innerText(), /^5\s?000,002\s*m³$/);
    assert.equal(await page.evaluate(() => window.calls.length), 5);
    await card.locator('section[data-chart="hourly"] .plot').focus();
    await page.keyboard.press("Home");
    assert.match(await card.locator('section[data-chart="hourly"] .readout').innerText(), /0,25 m³/);

    const saved = await page.evaluate(async ({ tag, config }) => {
      const card = document.querySelector(tag);
      const editor = await card.constructor.getConfigElement();
      editor.hass = window.hass;
      editor.setConfig({ ...config, animate_meter: true, cost: { enabled: true } });
      document.body.append(editor);
      let next;
      editor.addEventListener("config-changed", ({ detail }) => { next = detail.config; });
      const form = editor.shadowRoot.querySelector("ha-form");
      if (form.schema.some(({ name }) => name === "cost")) throw new Error("Legacy cost editor is visible");
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
      window.hass.locale = { language: "en" };
      window.hass.states[id] = { ...window.hass.states[id], state: "4224.1" };
      document.querySelector(tag).hass = window.hass;
    }, { tag, id: config.meter_entity });
    assert.equal(await card.locator("h2").textContent(), "Gas meter");
    await card.getByRole("button", { name: "Battery voltage" }).tap();
    await card.getByText("Could not load Recorder data.").waitFor();
    assert.match(await card.locator(".reading-value").textContent(), /4,224\.100/);
  } finally {
    await browser.close();
  }
});

test("optional temperature overlay shares the hourly plot and can be toggled", { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.GAS_METER_CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 780 } });
    const settings = {
      ...config, temperature_entity: "sensor.outdoor_temperature",
      charts: { hourly: true, temperature: false, daily: false, monthly: false, voltage: false },
    };
    await mount(page, settings);
    const card = page.locator(tag);
    const toggle = card.getByRole("button", { name: "Hőmérséklet" });
    const hourly = card.locator('section[data-chart="hourly"]');
    const plot = hourly.locator(".plot");
    const readout = hourly.locator(".readout");
    await plot.waitFor();
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(() => window.calls.length), 1);

    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    await page.waitForFunction((tag) => document.querySelector(tag).views.get("hourly").plot.hasTemperature, tag);
    assert.equal(await card.locator("canvas:visible").count(), 1);
    await plot.focus();
    await page.keyboard.press("Home");
    assert.match(await readout.innerText(), /0,25 m³ · Hőmérséklet: -2 °C/);
    await page.keyboard.press("End");
    assert.match(await readout.innerText(), /1,65 m³ · Hőmérséklet: .* °C · folyamatban/);
    assert.equal(await page.evaluate(() => {
      const [, gas, temperature] = window.calls;
      return gas.start_time === temperature.start_time && gas.end_time === temperature.end_time;
    }), true);

    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    await plot.focus();
    await page.keyboard.press("Home");
    assert.doesNotMatch(await readout.innerText(), /°C/);

    await page.evaluate(() => { window.failTemperature = true; });
    await toggle.click();
    await hourly.getByText("A hőmérséklet-adatok nem tölthetők be.").waitFor();
    assert.equal(await plot.isVisible(), true);
    assert.equal(await card.locator("canvas:visible").count(), 1);

    const saved = await page.evaluate(async ({ tag, settings }) => {
      const card = document.querySelector(tag);
      const editor = await card.constructor.getConfigElement();
      editor.hass = window.hass;
      editor.setConfig(settings);
      let saved;
      editor.addEventListener("config-changed", (event) => { saved = event.detail.config; });
      const form = editor.shadowRoot.querySelector("ha-form");
      form.edit("temperature_entity", "sensor.garden_temperature");
      form.edit("show_temperature", true);
      return saved;
    }, { tag, settings });
    assert.equal(saved.temperature_entity, "sensor.garden_temperature");
    assert.equal(saved.charts.temperature, true);
  } finally {
    await browser.close();
  }
});

test("gas and voltage area gradients are visible below low readings in both themes", { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.GAS_METER_CHROMIUM });
  try {
    for (const dark of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 440, height: 820 }, colorScheme: dark ? "dark" : "light" });
      await mount(page, config, dark);
      const card = page.locator(tag);
      for (const [key, peak, low] of [["hourly", 8, 2], ["voltage", 4.2, 4.05]]) {
        await card.locator('section[data-chart="' + key + '"] canvas').waitFor();
        const pixels = await card.evaluate((card, { key, peak, low }) => {
          const { plot } = card.views.get(key);
          const points = plot.points.map((point, index, { length }) => ({
            ...point,
            value: index === 0 ? peak : Math.abs(index / length - 0.5) < 0.1 ? null : low,
          }));
          plot.setData(points, plot.unit, "en", "Europe/Budapest", plot.text);
          plot.select(null);
          const canvas = plot.canvas;
          const ratio = canvas.width / canvas.clientWidth;
          const ctx = canvas.getContext("2d");
          const read = (fraction, y) => {
            const x = 46 + (canvas.clientWidth - 60) * fraction;
            return Array.from(ctx.getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1).data);
          };
          return { above: read(0.25, 86), upper: read(0.25, 107), lower: read(0.25, 115), gap: read(0.5, 107) };
        }, { key, peak, low });
        assert.equal(pixels.above[3], 0);
        assert.equal(pixels.gap[3], 0);
        assert.ok(pixels.upper[3] >= 38, JSON.stringify(pixels));
        assert.ok(pixels.upper[3] > pixels.lower[3] && pixels.lower[3] > 0, JSON.stringify(pixels));
        const [red, green, blue] = pixels.upper;
        assert.ok(key === "hourly" ? red > green && green > blue : green > red && green > blue);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
