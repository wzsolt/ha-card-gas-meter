# Gas Meter Card

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5)](https://github.com/wzsolt/ha-card-gas-meter#install)
[![GitHub Actions](https://github.com/wzsolt/ha-card-gas-meter/actions/workflows/card.yml/badge.svg?branch=main)](https://github.com/wzsolt/ha-card-gas-meter/actions/workflows/card.yml)
[![Lint](https://github.com/wzsolt/ha-card-gas-meter/actions/workflows/lint.yml/badge.svg?branch=main&event=push)](https://github.com/wzsolt/ha-card-gas-meter/actions/workflows/lint.yml)
[![HACS Validation](https://github.com/wzsolt/ha-card-gas-meter/actions/workflows/hacs.yml/badge.svg?branch=main)](https://github.com/wzsolt/ha-card-gas-meter/actions/workflows/hacs.yml)
[![Release](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fwzsolt%2Fha-card-gas-meter%2Frelease-badge%2Frelease.json)](https://github.com/wzsolt/ha-card-gas-meter/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

A Home Assistant dashboard card for a cumulative gas meter. It shows the physical meter reading, the last report and the estimated battery level alongside interactive hourly, daily and monthly consumption charts and a battery voltage chart.

## Install

1. In HACS, open **Custom repositories** from the menu. Add `https://github.com/wzsolt/ha-card-gas-meter` as a **Dashboard** repository.
2. Download **Gas Meter Card** and reload your dashboard. If you manage Lovelace resources in YAML, add the JavaScript module URL shown by HACS to your resources.
3. Edit your dashboard, add **Gas Meter Card**, and select your sensors. You can also paste the YAML below into a manual card.

### Manual installation

Download `ha-card-gas-meter.js` from the [latest release](https://github.com/wzsolt/ha-card-gas-meter/releases/latest). Copy it to `/config/www/ha-card-gas-meter.js` and register `/local/ha-card-gas-meter.js` as a **JavaScript Module** resource. Reload the dashboard and add the card. After replacing a manually installed file, update the resource URL with a new version query parameter if your browser still serves the old file.

## Configuration

```yaml
type: custom:ha-card-gas-meter
title: Gázmérő
meter_entity: sensor.garden_gas_reader
consumption_entity: sensor.garden_gas_consumption
last_contact_entity: sensor.garden_gas_reader_last_contact
battery_level_entity: sensor.garden_gas_reader_battery_level_estimated
battery_voltage_entity: sensor.garden_gas_reader_battery_voltage
charts:
  hourly: true
  daily: true
  monthly: true
  voltage: true
```

| Option | Purpose |
| --- | --- |
| `title` | Optional title. Defaults to the localized “Gas meter”. |
| `meter_entity` | Physical meter reading. The card shows three decimal places. |
| `consumption_entity` | Separate cumulative gas sensor with statistics support, such as a `total` or `total_increasing` gas sensor. Used by all consumption charts. |
| `last_contact_entity` | Timestamp sensor for the last successful report. |
| `battery_level_entity` | Estimated charge from 0 to 100 percent. The badge shows the value as a percentage and fills its background proportionally. |
| `battery_voltage_entity` | Voltage sensor with the `measurement` state class for mean statistics. |
| `charts.hourly` | Show hourly consumption for the last 24 elapsed hours. Defaults to `true`. |
| `charts.daily` | Show the last 30 calendar days, including today. Defaults to `true`. |
| `charts.monthly` | Show the last 12 calendar months, including this month. Defaults to `true`. |
| `charts.voltage` | Show daily mean voltage for the last 30 calendar days. Defaults to `true`. |

Use the four buttons on the card to change the current view. Set the defaults in the visual card editor or YAML. Hover or tap to inspect a period. You can also tab into a chart and use the arrow keys, Home and End. Labels are available in English and Hungarian.

### Recorder and timing

Include the consumption and voltage sensors in Home Assistant Recorder. The hourly chart uses cumulative consumption history and clips the first and last hours to the rolling window. The day, month and voltage charts use Recorder statistics, so the latest period can lag the live readings and is marked as in progress. Empty periods appear as gaps. The card uses the time zone configured in Home Assistant and distinguishes repeated hours by their UTC offset.

The cumulative consumption sensor should track usage independently of manual corrections to the physical meter reading. With Gas Reader, consumption is assigned to the time Home Assistant receives the report. A delayed report may therefore show several hours of usage in a single hour. Hours with an available, unchanged counter show zero recorded usage.

## Migrate gas cost estimates

Gas Meter Card 1.0.0 moves the estimated MVM gas costs to the standalone [Gas Costs Card](https://github.com/wzsolt/ha-card-gas-costs). If you use the cost estimate, install the new card in HACS before updating. Copy `consumption_entity` and the complete `cost:` block into a new card of type `custom:ha-card-gas-costs`. Verify the estimate, then remove the old `cost:` block from this card. Version 1.0.0 ignores that block so older YAML still loads the meter and charts.

## Develop and release

```sh
npm ci
npm run lint
npm test
npm run build
npx playwright-core install chromium
npm run test:browser
```

Use `GAS_METER_CHROMIUM` to point the browser tests at an existing Chromium executable. The bundle is built at `dist/ha-card-gas-meter.js`. Pushes and pull requests run the unit tests, build and browser tests.

To release, update the package version and lockfile, add a matching version section to `CHANGELOG.md`, and push the corresponding tag such as `v0.1.0`. GitHub Actions publishes the module as a release asset after the tests pass, and verifies the asset. The HACS Validation workflow then checks the latest stable release and updates the Release badge with its version and validation result. The module runs within the user's Home Assistant dashboard and reads data through the existing connection.
