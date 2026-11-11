export const cardStyles = `
:host {
  display: block;
  container-type: inline-size;
  --gas-text: var(--primary-text-color, light-dark(#24262a, #f0f0f0));
  --gas-muted: var(--secondary-text-color, light-dark(#555d64, #b3b3b3));
  --gas-grid: var(--divider-color, light-dark(#d9dde0, #41464a));
  --gas-amber: light-dark(#865400, #ffc44c);
  --gas-blue: light-dark(#006b95, #61c5f0);
  --gas-green: light-dark(#23763a, #77ca89);
  --gas-red: light-dark(#a52c34, #ff8585);
  --gas-surface: color-mix(in srgb, var(--gas-text) 4%, transparent);
  color: var(--gas-text);
  font-family: var(--primary-font-family, inherit);
}
:host([data-theme-mode="dark"]) { color-scheme: dark; }
:host([data-theme-mode="light"]) { color-scheme: light; }
[hidden] { display: none !important; }
ha-card {
  display: block;
  overflow: hidden;
  background: var(--ha-card-background, var(--card-background-color, light-dark(#fff, #1c1c1c)));
}
.gas-card { padding: 14px; }
.header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px 12px;
  align-items: center;
}
.title-group, .reading-row, .chart-heading { display: flex; align-items: center; gap: 10px; }
h2, h3, p { margin: 0; overflow-wrap: anywhere; }
h2 { font-size: 1.2rem; font-weight: 650; line-height: 1.25; }
h3 { font-size: 0.94rem; font-weight: 650; }
.glyph {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--accent, var(--gas-amber));
  background: color-mix(in srgb, currentColor 14%, transparent);
}
.glyph ha-icon { --mdc-icon-size: 19px; }
.title-group .glyph { width: 42px; height: 42px; }
.reading { min-width: 0; }
.reading-label, .subtitle, .chip-label { font-size: 0.76rem; color: var(--gas-muted); }
.reading-label { margin-bottom: 2px; }
.reading-row { gap: 5px; flex-wrap: wrap; }
.reading-value { font-size: clamp(1.35rem, 5cqi, 1.85rem); line-height: 1.15; font-weight: 700; font-variant-numeric: tabular-nums; }
.reading-unit { color: var(--gas-muted); font-size: 0.84rem; font-weight: 600; }
.summary { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; }
.chip, .toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 3px 9px;
  border-radius: 999px;
  box-sizing: border-box;
  color: var(--accent, var(--gas-muted));
  background: color-mix(in srgb, currentColor 11%, transparent);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
}
.battery_level_entity:is([data-level="good"], [data-level="low"]) {
  background-image: linear-gradient(
    to right,
    color-mix(in srgb, currentColor 17%, transparent) 0 var(--battery-fill),
    transparent var(--battery-fill)
  );
}
.chip ha-icon, .toggle ha-icon { --mdc-icon-size: 16px; }
.chip-copy { display: flex; gap: 5px; flex-wrap: wrap; }
.chip-value { font-variant-numeric: tabular-nums; }
.last_contact_entity, [data-chart="daily"] { --accent: var(--gas-blue); }
[data-chart="hourly"], [data-chart="monthly"] { --accent: var(--gas-amber); }
[data-chart="voltage"], [data-level="good"] { --accent: var(--gas-green); }
[data-level="low"] { --accent: var(--gas-red); }
.chart-controls { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; padding-top: 11px; border-top: 1px solid var(--gas-grid); }
.toggle { border: 1px solid transparent; cursor: pointer; }
.toggle[aria-pressed="false"] { color: var(--gas-muted); background: transparent; border-color: var(--gas-grid); }
.toggle:hover { border-color: currentColor; }
.toggle:focus-visible, .plot:focus-visible { outline: 2px solid var(--primary-color, #1686b7); outline-offset: 2px; }
.charts { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.charts:has(.chart:not([hidden])) { margin-top: 10px; }
.chart { min-width: 0; padding: 10px; border: 1px solid color-mix(in srgb, var(--gas-text) 9%, transparent); border-radius: 14px; background: var(--gas-surface); }
.chart-heading { align-items: center; margin-bottom: 8px; }
.chart-heading .glyph { width: 30px; height: 30px; }
.chart-heading ha-icon { --mdc-icon-size: 16px; }
.subtitle { margin-top: 2px; }
.plot { color: var(--accent); border: 0 solid var(--gas-grid); border-radius: 6px; }
canvas { display: block; width: 100%; height: 148px; touch-action: pan-y; }
.note, .status, .readout { font-size: 0.75rem; color: var(--gas-muted); line-height: 1.4; }
.readout { min-height: 1.4em; margin: 0 4px; font-variant-numeric: tabular-nums; }
.note { margin: 4px; }
.status { margin: 8px 4px 6px; }
@container (min-width: 680px) {
  .charts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 360px) {
  .gas-card { padding: 10px; }
  .header { grid-template-columns: minmax(0, 1fr); }
}
`;
