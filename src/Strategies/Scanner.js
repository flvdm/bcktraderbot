import OrderController from "../Controllers/OrderController.js";
import AccountStore from "../Store/AccountStore.js";
import Markets from "../Backpack/Markets.js";
import Utils from "../Utils/Utils.js";
import { logError, logInfo } from "../Utils/logger.js";
import Helper from "./Helpers/Helper.js";

class Scanner {
  constructor() {
    this.initialized = false;
    this.nextFullRun = 0;
    this.first50isRunning = false;
    this.lowBalanceNotified = false;
  }

  async init() {
    const knownMarketsFileData = await Utils.readDataFromFile("knownPerpMarkets.json");
    this.knownMarkets = knownMarketsFileData ? knownMarketsFileData : JSON.parse(process.env.AUTHORIZED_MARKETS);

    const knownSpotMarketsFileData = await Utils.readDataFromFile("knownSpotMarkets.json");
    this.knownSpotMarkets = knownSpotMarketsFileData
      ? knownSpotMarketsFileData
      : JSON.parse(process.env.BOOSTER_MARKETS);

    const newMarketsBKP = await Utils.readDataFromFile("newMarketsBKP.json");
    this.newMarkets = newMarketsBKP ? newMarketsBKP : [];
  }

  async _doPerpTrade(newMarket, side = "random") {
    let order = {};
    order.symbol = newMarket.symbol;
    order.entry = newMarket.price;
    order.decimal_quantity = newMarket.decimal_quantity;
    order.decimal_price = newMarket.decimal_price;
    order.stepSize_quantity = newMarket.stepSize_quantity;
    order.tickSize = newMarket.tickSize;
    order.quantity = newMarket.quantity;

    if (side === "long") {
      order.stop = newMarket.price * 0.99;
      order.target = newMarket.price * 1.01;
      order.action = "long";
    } //
    else if (side === "short") {
      order.stop = newMarket.price * 1.01;
      order.target = newMarket.price * 0.99;
      order.action = "short";
    } //
    else {
      const randomBoolean = Math.random() >= 0.5;
      if (randomBoolean) {
        order.stop = newMarket.price * 0.99;
        order.target = newMarket.price * 1.01;
        order.action = "long";
      } else {
        order.stop = newMarket.price * 1.01;
        order.target = newMarket.price * 0.99;
        order.action = "short";
      }
    }
    return await OrderController.openMarketOrder(order);
  }

  async _doSpotTrade(side, newMarket, volume) {
    const order = {};
    order.side = side;
    order.volume = volume;
    order.symbol = newMarket.symbol;
    order.decimal_quantity = newMarket.decimal_quantity;
    order.decimal_price = newMarket.decimal_price;
    order.stepSize_quantity = newMarket.stepSize_quantity;
    order.tickSize = newMarket.tickSize;
    return await OrderController.openOrderSpot(order);
  }

  async _doBatchTrade(newMarket, number) {
    const ordersBatch = [];
    for (let i = -number; i <= number; i++) {
      if (i === 0) continue;
      let order = {};
      order.symbol = newMarket.symbol;
      order.decimal_quantity = newMarket.decimal_quantity;
      order.decimal_price = newMarket.decimal_price;
      order.stepSize_quantity = newMarket.stepSize_quantity;
      order.tickSize = newMarket.tickSize;
      order.quantity = newMarket.quantity;
      const entryPrice = newMarket.price + parseFloat(newMarket.tickSize) * i;
      order.entry = entryPrice;
      if (i > 0) {
        order.action = "long";
        //order.stop = entryPrice - parseFloat(newMarket.tickSize) * 5;
        //order.target = entryPrice + parseFloat(newMarket.tickSize) * 5;
      } else {
        order.action = "short";
        //order.stop = entryPrice + parseFloat(newMarket.tickSize) * 5;
        //order.target = entryPrice - parseFloat(newMarket.tickSize) * 5;
      }
      ordersBatch.push(order);
    }
    return await OrderController.createBatchOfMarketTriggerOrders(ordersBatch);
  }

  async _saveState() {
    await Utils.saveDataToFile(this.newMarkets, "newMarketsBKP.json");
    if (this.newMarkets.length === 0) {
      await Utils.deleteFile("newMarketsBKP.json");
    }
  }

  async _doFirst50Routine() {
    //
    // First 50 routine: try to be one of 50 to trade the new token
    //
    if (this.first50isRunning) {
      const msg = "First50 Routine is already running, skipping this time.";
      console.log(msg);
      logInfo(msg);
      return;
    }
    this.first50isRunning = true;
    let first50Length = 0;
    const first50Markets = [];
    for (const newMarket of this.newMarkets) {
      if (newMarket.phase === "first50") {
        console.log("1️⃣  Executing 'first50' routine for " + newMarket.symbol);

        // const markPrices = await Markets.getAllMarkPrices(newMarket.symbol);
        // const marketPrice = parseFloat(markPrices[0].markPrice);
        // newMarket.price = marketPrice;

        const candles = await Markets.getKLines(newMarket.symbol, "1m", 3);
        logInfo(newMarket.symbol + " 1m candles", candles);
        let marketPrice = null;
        if (candles) marketPrice = candles[2]?.close || candles[1]?.close || candles[0]?.close || null;
        newMarket.price = parseFloat(marketPrice);
        logInfo(newMarket.symbol + " marketPrice", marketPrice);
        console.log(newMarket.symbol, newMarket.price);

        //infer props
        if (newMarket.decimal_quantity === undefined || newMarket.stepSize_quantity === 0) {
          const props = Helper.inferMarketProps(marketPrice);
          newMarket.decimal_quantity = props.qtdHouses;
          newMarket.decimal_price = props.prcHouses;
          newMarket.stepSize_quantity = props.qtdStep;
          newMarket.tickSize = props.prcStep;
        }
        Helper.checkMarketPropsFix(newMarket);

        //estimated minimum quantity allowed
        const x = 1 / marketPrice;
        const n = Math.floor(Math.log10(x));
        newMarket.quantity = Math.pow(10, n);

        newMarket.attemptsLeft = 3;
        first50Markets.push(newMarket);
        logInfo("newMarket", newMarket);
      }
    }
    first50Length = first50Markets.length;
    logInfo("first50Length", first50Length);
    if (first50Length > 0) {
      let finished = 0;
      const spotVolumes = ["15", "7", "3"];

      for (let i = 0; i < 100; i++) {
        let j = i % first50Length;
        const newMarket = first50Markets[j];

        if (newMarket.attemptsLeft > 0 && newMarket.phase === "first50") {
          if (newMarket.type === "perp") {
            logInfo(newMarket.symbol + " inside perp attempt.");
            newMarket.attemptsLeft -= 1;
            const response = await this._doPerpTrade(newMarket, "long");
            logInfo(newMarket.symbol + " doPerpTrade response", response);
            if (typeof response === "object" && response.status === "Filled") {
              Utils.notify(`✅ Successfully traded ${newMarket.symbol}`);
              newMarket.phase = "lucky777";
              logInfo(newMarket.symbol + " successfully traded. Switching to lucky777 phase.");
              // close successful perp trade
              setTimeout(() => {
                this._doPerpTrade(newMarket, "short");
                logInfo(newMarket.symbol + " closing the fisrt50 position.");
              }, 5000);
              finished += 1;
            } //
            else if (response?.message === "No liquidity for market order") {
              newMarket.attemptsLeft = 0;
              if (!newMarket.notifiedNoLiquidity) {
                const msg = `⚠️ No liquidity for market order in ${newMarket.symbol}. Keep trying on the next candles....`;
                Utils.notify(msg);
                console.log(msg);
                newMarket.notifiedNoLiquidity = true;
              }
              logInfo(newMarket.symbol + " Trade failed: No liquidity for market order. Trying again next candle...");
              finished += 1;
            } //
            else if (
              newMarket.attemptsLeft > 0 &&
              (response?.message === "Quantity is below the minimum allowed value" ||
                response?.message === "Quantity decimal too long")
            ) {
              //'Market orders must specify a positive `quantity`' //executedQuantity: '100'
              console.log(`${newMarket.symbol} trade failed. Trying again with more quantity...`);
              logInfo(newMarket.symbol + " trade failed. Trying again with more quantity...");
              newMarket.quantity *= 10;
            } //
            else {
              const msg = `❌ Failed to trade ${newMarket.symbol}. Reason: ${response?.message}`;
              Utils.notify(msg);
              console.log(msg);
              logInfo(msg);
              newMarket.phase = "invalid";
              finished += 1;
            }
          } //
          else if (newMarket.type === "spot") {
            logInfo(newMarket.symbol + " inside spot attempt.");
            newMarket.attemptsLeft -= 1;
            const volume = spotVolumes[newMarket.attemptsLeft];
            const response = await this._doSpotTrade("Bid", newMarket, volume);
            logInfo(newMarket.symbol + " doSpotTrade response", response);
            if (typeof response === "object" && response.status === "Filled") {
              Utils.notify(`✅ Successfully bought $${volume} of ${newMarket.symbol}`);
              newMarket.volume = volume;
              newMarket.phase = "clockingin";
              newMarket.clockinNextTime = Date.now() + 120000;
              console.log(newMarket.symbol + " set to 'clockingin' phase.");
              logInfo(newMarket.symbol + " successfully traded. Switching to clockingin phase.");
              // close successful spot trade
              setTimeout(() => {
                this._doSpotTrade("Ask", newMarket, response.executedQuoteQuantity * 0.999);
                logInfo(newMarket.symbol + " closing the fisrt50 position.");
              }, 5000);
              finished += 1;
            } //
            else if (response?.message === "No liquidity for market order") {
              newMarket.attemptsLeft = 0;
              if (!newMarket.notifiedNoLiquidity) {
                const msg = `⚠️ No liquidity for market order in ${newMarket.symbol}. Keep trying on the next candles....`;
                Utils.notify(msg);
                console.log(msg);
                newMarket.notifiedNoLiquidity = true;
              }
              logInfo(newMarket.symbol + " Trade failed: No liquidity for market order. Trying again next candle...");
              finished += 1;
            } //
            else if (
              newMarket.attemptsLeft > 0 &&
              response?.message === "Quantity is below the minimum allowed value"
            ) {
              console.log("Trade failed. Trying again with more volume...");
              logInfo(newMarket.symbol + "Trade failed. Trying again with more volume...");
            } //
            else {
              const msg = `❌ Failed to trade ${newMarket.symbol}. Reason: ${response?.message}`;
              Utils.notify(msg);
              console.log(msg);
              logInfo(msg);
              newMarket.phase = "invalid";
              finished += 1;
            }
          }

          if (finished >= first50Length) {
            logInfo("Finished First50 routine for all newMarkets.", finished);
            break;
          }
        }
      }
      //remove the invalid ones from the list
      for (let i = this.newMarkets.length - 1; i >= 0; i--) {
        if (this.newMarkets[i].phase === "invalid") {
          let removed = this.newMarkets.splice(i, 1);
          logInfo("Removing the invalided newMarket: ", removed);
        }
      }
    }
    this.first50isRunning = false;
  }

  async _doLucky777Routine(newMarket) {
    //
    // Lucky 777 routine: try to do the 777 trade on the new token
    //
    //
    if (newMarket.phase === "lucky777") {
      console.log("2️⃣  Executing 'lucky777' routine for " + newMarket.symbol);
      logInfo("Executing 'lucky777' routine for " + newMarket.symbol);
      if (newMarket.type === "perp") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await OrderController.cancelAllOrders(newMarket.symbol);

        const markPrices = await Markets.getAllMarkPrices(newMarket.symbol);
        newMarket.price = parseFloat(markPrices[0].markPrice);
        const response = await this._doPerpTrade(newMarket, "long");
        logInfo(newMarket.symbol + " lucky777 perpTrade response: ", response);
        if (typeof response === "object" && response.status === "Filled") {
          setTimeout(() => {
            this._doPerpTrade(newMarket, "short");
            logInfo(newMarket.symbol + " closing previous lucky777 trade.");
          }, 5000);
        }
        await this._doBatchTrade(newMarket, 5);

        const candles = await Markets.getKLines(newMarket.symbol, "1m", 1);
        const trades = candles ? Number(candles[0]?.trades) : null;
        if (trades) newMarket.totalTrades += trades;
        console.log(`${newMarket.symbol} total trades: `, newMarket.totalTrades);
        logInfo(newMarket.symbol + " total trades.");

        if (newMarket.totalTrades > 777) {
          newMarket.phase = "clockingin";
          newMarket.clockinNextTime = Date.now() + 120000;
          console.log(newMarket.symbol + " set to 'clockingin' phase.");
          logInfo(newMarket.symbol + " change to 'clockingin' phase.");
        }
      }
    }
  }

  async _doClockingInRoutine(newMarket) {
    //
    // Clocking In: trade the new token for all 7 days after launch
    //
    if (newMarket.phase === "clockingin") {
      if (Date.now() > newMarket.clockinNextTime) {
        console.log("3️⃣  Executing 'clocking in' routine for " + newMarket.symbol);
        logInfo("Executing 'clocking in' routine for " + newMarket.symbol);

        if (newMarket.type === "perp") {
          const response = await this._doPerpTrade(newMarket, "long");
          logInfo(newMarket.symbol + "cloackingin PERP trade response: ", response);
          if (typeof response === "object" && response.status === "Filled") {
            setTimeout(() => {
              this._doPerpTrade(newMarket, "short");
              logInfo(newMarket.symbol + "closing previous perp trade.");
            }, 5000);
          }
        } //
        else if (newMarket.type === "spot") {
          const response = await this._doSpotTrade("Bid", newMarket, newMarket.volume);
          logInfo(newMarket.symbol + "cloackingin SPOT trade response: ", response);
          if (typeof response === "object" && response.status === "Filled") {
            setTimeout(() => {
              this._doSpotTrade("Ask", newMarket, response.executedQuoteQuantity * 0.999);
              logInfo(newMarket.symbol + "closing previous spot trade.");
            }, 5000);
          }
        }
        newMarket.clockinOrdersSent += 1;
        newMarket.clockinNextTime += 43200000;
        console.log(
          `Clocking In: ${newMarket.symbol}   trades done: [${
            newMarket.clockinOrdersSent
          }/15]   next: ${Utils.formatDateTime(newMarket.clockinNextTime)}`
        );
        if (newMarket.clockinOrdersSent >= 15) {
          console.log("❇️  Completed all routines for " + newMarket.symbol);
          logInfo("Completed all routines for " + newMarket.symbol);
          newMarket.phase = "finished";
        }
      }
    }
  }

  async run() {
    try {
      if (!this.initialized) await this.init();

      //Check sufficient account balance for new orders
      const capitalAvailable = await AccountStore.getAvailableCapital();
      if (capitalAvailable < this.maxOrderVolume) {
        if (!this.lowBalanceNotified) {
          await Utils.notify("⚠️ Insuficient balance to trade new tokens. Please deposit money.");
          this.lowBalanceNotified = true;
        }
        console.log("⚠️ Insuficient balance to open new orders. Skipping this candle.");
        return;
      } else {
        this.lowBalanceNotified = false;
      }

      // Check PERP Markets
      const currentPerpMarkets = await AccountStore.getMarkets();
      const newPerpMarkets = currentPerpMarkets.filter((el) => {
        const isNew = !this.knownMarkets.includes(el.symbol);
        if (isNew) {
          this.knownMarkets.push(el.symbol);
          this.newMarkets.push({
            symbol: el.symbol,
            totalTrades: 0,
            clockinNextTime: null,
            clockinOrdersSent: 0,
            phase: "first50",
            type: "perp",
            quantity: null,
            decimal_quantity: el.decimal_quantity,
            decimal_price: el.decimal_price,
            stepSize_quantity: el.stepSize_quantity,
            tickSize: el.tickSize,
          });
        }
        return isNew;
      });
      logInfo("newPerpMarkets", newPerpMarkets);
      if (newPerpMarkets.length > 0) {
        console.log("🌟 New PREP market(s) FOUND!", newPerpMarkets);
        await Utils.saveDataToFile(this.knownMarkets, "knownPerpMarkets.json");
        for (const market of newPerpMarkets) {
          await Utils.notify("🌟 New PERP token(s) found! " + market.symbol);
        }
      }

      // Check SPOT markets
      const currentSpotMarkets = await AccountStore.getMarkets("SPOT");
      const newSpotMarkets = currentSpotMarkets.filter((el) => {
        const isNew = !this.knownSpotMarkets.includes(el.symbol);
        if (isNew) {
          this.knownSpotMarkets.push(el.symbol);
          this.newMarkets.push({
            symbol: el.symbol,
            totalTrades: 0,
            clockinNextTime: null,
            clockinOrdersSent: 0,
            phase: "first50",
            type: "spot",
            volume: null,
            decimal_quantity: el.decimal_quantity,
            decimal_price: el.decimal_price,
            stepSize_quantity: el.stepSize_quantity,
            tickSize: el.tickSize,
          });
        }
        return isNew;
      });
      logInfo("newSpotMarkets", newSpotMarkets);
      if (newSpotMarkets.length > 0) {
        console.log("🌟 New SPOT market(s) FOUND!", newSpotMarkets);
        await Utils.saveDataToFile(this.knownSpotMarkets, "knownSpotMarkets.json");
        for (const spotMarket of newSpotMarkets) {
          await Utils.notify("🌟 New SPOT token found! " + spotMarket.symbol);
        }
      }

      //= = = = = = = = = = = = = = = =//
      //                               //
      // newly found markets routines  //
      //                               //
      //= = = = = = = = = = = = = = = =//
      logInfo("this.newMarkets", this.newMarkets);
      if (this.newMarkets.length > 0) {
        await this._doFirst50Routine();

        if (Date.now() > this.nextFullRun) {
          for (let i = this.newMarkets.length - 1; i >= 0; i--) {
            const newMarket = this.newMarkets[i];

            await this._doLucky777Routine(newMarket);
            await this._doClockingInRoutine(newMarket);

            if (newMarket.phase === "finished") {
              this.newMarkets.splice(i, 1);
            }
          }
          this.nextFullRun = Math.floor(Date.now() / 60000) * 60000 + 59000;

          await this._saveState();
        }
      }

      console.log(
        "\n⚜️  Strategy evaluated. Possible orders placed and canceled. " + Utils.getFormatedCurrentDateTime(-3) + "\n"
      );
    } catch (error) {
      console.log(error);
    }
  }
}

export default Scanner;
