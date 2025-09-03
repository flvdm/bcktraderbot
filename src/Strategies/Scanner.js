import OrderController from "../Controllers/OrderController.js";
import AccountStore from "../Store/AccountStore.js";
import Markets from "../Backpack/Markets.js";
import Utils from "../Utils/Utils.js";

class Scanner {
  constructor() {
    this.initialized = false;
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

  async _doMarketTrade(newMarket, side = "random") {
    const markPrices = await Markets.getAllMarkPrices(newMarket.symbol);
    const marketPrice = parseFloat(markPrices[0].markPrice);
    newMarket.price = marketPrice;
    let order = {};
    order.symbol = newMarket.symbol;
    order.entry = marketPrice;
    order.decimal_quantity = newMarket.decimal_quantity;
    order.decimal_price = newMarket.decimal_price;
    order.stepSize_quantity = newMarket.stepSize_quantity;
    order.tickSize = newMarket.tickSize;
    order.volume = 10;

    if (side === "long") {
      order.stop = marketPrice * 0.99;
      order.target = marketPrice * 1.01;
      order.action = "long";
    } //
    else if (side === "short") {
      order.stop = marketPrice * 1.01;
      order.target = marketPrice * 0.99;
      order.action = "short";
    } //
    else {
      const randomBoolean = Math.random() >= 0.5;
      if (randomBoolean) {
        order.stop = marketPrice * 0.99;
        order.target = marketPrice * 1.01;
        order.action = "long";
      } else {
        order.stop = marketPrice * 1.01;
        order.target = marketPrice * 0.99;
        order.action = "short";
      }
    }
    await OrderController.openMarketOrderScanner(order);
  }

  _generateOrdersBatch(newMarket, number) {
    const ordersBatch = [];
    for (let i = -number; i <= number; i++) {
      if (i === 0) continue;
      let order = {};
      order.symbol = newMarket.symbol;
      // order.decimal_quantity = newMarket.decimal_quantity;
      // order.decimal_price = newMarket.decimal_price;
      // order.stepSize_quantity = newMarket.stepSize_quantity;
      // order.tickSize = newMarket.tickSize;
      order.decimal_quantity = newMarket.qtdHouses;
      order.decimal_price = newMarket.prcHouses;
      order.stepSize_quantity = newMarket.qtdStep;
      order.tickSize = newMarket.prcStep;
      order.volume = 1;
      const entryPrice = newMarket.price + parseFloat(newMarket.tickSize) * i;
      order.entry = entryPrice;
      if (i > 0) {
        order.action = "long";
        order.stop = entryPrice - parseFloat(newMarket.tickSize) * 5;
        order.target = entryPrice + parseFloat(newMarket.tickSize) * 5;
      } else {
        order.action = "short";
        order.stop = entryPrice + parseFloat(newMarket.tickSize) * 5;
        order.target = entryPrice - parseFloat(newMarket.tickSize) * 5;
      }
      ordersBatch.push(order);
    }
    return ordersBatch;
  }

  async run() {
    try {
      if (!this.initialized) await this.init();

      console.log("\n📣 Previous candle closed. Running a new cicle of analysis.\n");

      //Check sufficient account balance for new orders
      const capitalAvailable = await AccountStore.getAvailableCapital();
      if (capitalAvailable < this.maxOrderVolume) {
        console.log("⚠️ Insuficient balance to open new orders. Skipping this candle.");
        return;
      }

      const currentMarkets = await AccountStore.getMarkets();
      const newMarkets = currentMarkets.filter((el) => {
        const isNew = !this.knownMarkets.includes(el.symbol);
        if (isNew) {
          this.knownMarkets.push(el.symbol);
          this.newMarkets.push({
            symbol: el.symbol,
            totalTrades: 0,
            clockinNextTime: null,
            clockinOrdersSent: 0,
            doLong: false,
            phase: "first50",
            decimal_quantity: el.decimal_quantity,
            decimal_price: el.decimal_price,
            stepSize_quantity: el.stepSize_quantity,
            tickSize: el.tickSize,
          });
        }
        return isNew;
      });

      if (newMarkets.length > 0) {
        console.log("🌟 New PREP market(s) FOUND!", newMarkets);
        for (const market of newMarkets) {
          await Utils.notify("🌟 New PERP token(s) found! " + market.symbol + "\nInitiating the routine.");
        }
        await Utils.saveDataToFile(this.knownMarkets, "knownPerpMarkets.json");
      } else {
        console.log("No new PERP market found.");
      }

      if (this.newMarkets.length > 0) {
        for (let i = this.newMarkets.length - 1; i >= 0; i--) {
          const newMarket = this.newMarkets[i];
          // First 50 routine: try to be one of 50 to trade the new token
          if (newMarket.phase === "first50") {
            console.log("1️⃣  Executing 'first50' routine for " + newMarket.symbol);
            await this._doMarketTrade(newMarket, "long");
            newMarket.phase = "lucky777";
          }
          // Lucky 777 routine: try to do the 777 trade on the new token
          if (newMarket.phase === "lucky777") {
            console.log("2️⃣  Executing 'lucky777' routine for " + newMarket.symbol);
            if (!newMarket.price) {
              await OrderController.cancelAllOrders(newMarket.symbol);
              const candles = await Markets.getKLines(newMarket.symbol, "1m", 1);
              const markPrices = await Markets.getAllMarkPrices(newMarket.symbol);
              newMarket.price = parseFloat(markPrices[0].markPrice);
              if (!newMarket.doLong) {
                await this._doMarketTrade(newMarket, "short");
                newMarket.doLong = true;
              }
              const trades = Number(candles[0].trades);
              if (trades) newMarket.totalTrades += trades;
              console.log("totalTrades: ", newMarket.totalTrades);
              if (newMarket.totalTrades > 777) {
                newMarket.phase = "clockingin";
                newMarket.clockinOrdersSent += 1;
                newMarket.clockinNextTime = Date.now() + 43200000;
                console.log(newMarket.symbol + " set to 'clockingin' phase.");
              }
            } else {
              const qtt = 1 / newMarket.price;
              newMarket.qtdHouses = 5;
              for (let i = 0; i < 5; i++) {
                if ((qtt * 10 ** i).toFixed() >= 1) {
                  newMarket.qtdHouses = i;
                  break;
                }
              }
              newMarket.prcHouses = 6;
              for (let i = 1; i < 6; i++) {
                if ((newMarket.price * 10 ** i).toFixed() >= 1000) {
                  newMarket.prcHouses = i;
                  break;
                }
              }
              newMarket.prcStep = 1 / 10 ** newMarket.prcHouses;
              newMarket.qtdStep = 1 / 10 ** newMarket.qtdHouses;
            }
            const ordersBatch = this._generateOrdersBatch(newMarket, 5);
            await OrderController.createBatchOfMarketTriggerOrders(ordersBatch);
            newMarket.price = null;
          }
          // Clocking In: trade the new token for all 7 days after launch
          if (newMarket.phase === "clockingin") {
            console.log(
              `Clocking In: ${newMarket.symbol}   trades done: [${
                newMarket.clockinOrdersSent
              }/15]   next: ${Utils.formatDateTime(newMarket.clockinNextTime)}`
            );
            if (Date.now() > newMarket.clockinNextTime) {
              console.log("3️⃣  Executing 'clocking in' routine for " + newMarket.symbol);
              if (newMarket.doLong) {
                await this._doMarketTrade(newMarket, "long");
                newMarket.doLong = !newMarket.doLong;
              } else {
                await this._doMarketTrade(newMarket, "short");
                newMarket.doLong = !newMarket.doLong;
              }
              newMarket.clockinOrdersSent += 1;
              newMarket.clockinNextTime += 43200000;
              if (newMarket.clockinOrdersSent >= 15) {
                this.newMarkets.splice(i, 1);
                console.log("❇️  Completed all routines for " + newMarket.symbol);
              }
            }
          }
        }

        await Utils.saveDataToFile(this.newMarkets, "newMarketsBKP.json");
        if (this.newMarkets.length === 0) {
          await Utils.deleteFile("newMarketsBKP.json");
        }
      }

      // Check SPOT markets
      const currentSpotMarkets = await AccountStore.getMarkets("SPOT");
      const newSpotMarkets = currentSpotMarkets.filter((el) => {
        const isNew = !this.knownSpotMarkets.includes(el.symbol);
        if (isNew) {
          this.knownSpotMarkets.push(el.symbol);
        }
        return isNew;
      });

      if (newSpotMarkets.length > 0) {
        console.log("🌟 New SPOT market(s) FOUND!", newSpotMarkets);
        await Utils.saveDataToFile(this.knownSpotMarkets, "knownSpotMarkets.json");

        for (const spotMarket of newSpotMarkets) {
          await Utils.notify("🌟 New SPOT token found! " + spotMarket.symbol + "\nBuying $1 of it.");
          const order = {
            side: "Bid",
            symbol: spotMarket.symbol,
            volume: "1",
          };
          await OrderController.openOrderSpot(order);
        }
      } else {
        console.log("No new SPOT market found.");
      }

      console.log(
        "\n⚜️  Strategy evaluated. Possible orders placed and canceled. " +
          Utils.getFormatedCurrentDateTime(-3) +
          "\n\n"
      );
    } catch (error) {
      console.log(error);
    }
  }
}

export default Scanner;
