# Changelog

## [0.3.0]

- Accept an opening date and the gas used before it to initialize the MVM allowance balance.
- Calculate costs from Home Assistant readings on and after the opening date for that gas year.

## [0.2.0]

- Add optional MVM residential gas cost estimates in HUF for the current day, month, gas year and billing period.
- Show daily, monthly and gas-year cost charts with the tariff tiers, base fee and estimated tier corrections.
- Add tariff and allowance settings to the visual editor and YAML, and mark missing consumption and delayed Recorder data.

## [0.1.1]

- Remove the animated digit beside the meter reading. Existing YAML with `animate_meter` still loads.
- Fill the battery badge background in proportion to the estimated charge.

## [0.1.0]

- Show the gas meter reading, last report and estimated battery level in one dashboard card.
- Add interactive hourly, daily and monthly gas consumption charts and daily battery voltage.
- Add visual configuration, independent chart controls and a reduced-motion-aware meter animation.
- Publish an installable HACS Dashboard release with English installation instructions.
