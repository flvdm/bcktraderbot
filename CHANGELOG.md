# Changelog 📋

## [1.1.18] - 2025/10/20

- Scanner strategy: minor fix to getting the minimum balance value;

## [1.1.17] - 2025/10/20

- Scanner strategy: Reduced first50 routine run time to 10 seconds, increasing the chance of being in the first 50 to trade the new token.
- Scanner strategy: Added notification when balance is too low.

## [1.1.16] - 2025/10/19

- Minor bug fix with multiplier.

## [1.1.15] - 2025/09/26

- Added MidCandle strategy ability to trade new markets that may appear.

## [1.1.14] - 2025/09/26

- Scanner strategy: keep trying on "No liquidity" error.

## [1.1.13] - 2025/09/13

- Added option to directly fix inconsistent market props values via env file.

## [1.1.12] - 2025/09/11

- Huge code revision in Scanner strategy.
- Some fixes in order related codebase.

## [1.1.11] - 2025/09/08

- Added special case for 10m Midcancle strategy.

## [1.1.10] - 2025/09/08

- Added Multiplier parameter.

## [1.1.9] - 2025/09/08

- Fixed another cancel orders bug when empty Authorized Markets in Midcandle strategy.

## [1.1.8] - 2025/09/08

- Fixed cancel orders bug when empty Authorized Markets in Midcandle strategy.

## [1.1.7] - 2025/09/08

- Fixed low balance verification in Midcandle strategy.
- Option to select between lastprice or markprice in some orders.

## [1.1.6] - 2025/09/07

- Changes to how booster markerts works in Midcandle strategy.

## [1.1.5] - 2025/09/07

- Some changes to OrderController's calculations.

## [1.1.4] - 2025/09/06

- Added logger module to save log info to disk.

## [1.1.3] - 2025/09/04

- Little corrections.

## [1.1.2] - 2025/09/04

- Added more defense against adverse situations.

## [1.1.1] - 2025/09/03

- Bug fixes in Scanner strategy.

## [1.1.0] - 2025/09/01

- Many bug fixes in Scanner strategy.
- Huge improvements in the whole code base.

## [1.0.8] - 2025/08/30

- Scanner strategy done.
- Minor improvements.

## [1.0.8] - 2025/08/30

- Added Dockerfile.

## [1.0.7] - 2025/08/30

- Many bug fixes.
- Prototype of new Scanner strategy.

## [1.0.6] - 2025/08/30

- Added evaluation of trade retrictions.
- Prepare order data.

## [1.0.5] - 2025/08/30

- Get candles data for symbols.
- Generate strategy calculations on the symbols data.

## [1.0.4] - 2025/08/29

- Get account data from exchange.
- Added more restrictions to MidCandle Strategy.

## [1.0.3] - 2025/08/29

- Added authentication signature for API calls.
- Added cancel order API calls.

## [1.0.2] - 2025/08/29

- Working in the first strategy named MidCandle.
- Improving project structure.

## [1.0.1] - 2025/08/28

- Improving project structure.
- Adding initial code.

## [1.0.0] - 2025/08/28

### Initial project structure.
