import OrderController from "../Controllers/OrderController.js";
import AccountStore from "../Store/AccountStore.js";
import Markets from "../Backpack/Markets.js";
import Utils from "../Utils/Utils.js";

class Scanner {
  constructor() {
    this.knownMarkets = JSON.parse(process.env.AUTHORIZED_MARKETS);
    this.newMarkets = [];
  }

  async _doMarketTrade(newMarket) {
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
    order.volume = parseFloat(newMarket.stepSize_quantity) * 1.5 * marketPrice;
    order.stop = marketPrice * 0.99;
    order.target = marketPrice * 1.01;
    order.action = "long";
    await OrderController.openMarketOrder(order);
  }

  _generateOrdersBatch(newMarket, number) {
    const ordersBatch = [];
    for (let i = -number; i <= number; i++) {
      if (i === 0) continue;
      let order = {};
      order.symbol = newMarket.symbol;
      order.decimal_quantity = newMarket.decimal_quantity;
      order.decimal_price = newMarket.decimal_price;
      order.stepSize_quantity = newMarket.stepSize_quantity;
      order.tickSize = newMarket.tickSize;
      order.volume = parseFloat(newMarket.stepSize_quantity) * 1.5 * newMarket.price;
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
        console.log("🌟 New market(s) FOUND!");
        //Do telegram notification
      } else {
        console.log("No new market found.");
      }

      if (this.newMarkets.length > 0) {
        for (let i = this.newMarkets.length - 1; i >= 0; i--) {
          const newMarket = this.newMarkets[i];
          // First 50 routine: try to be one of 50 to trade the new token
          if (newMarket.phase === "first50") {
            console.log("1️⃣  Executing 'first50' routine for " + newMarket.symbol);
            await this._doMarketTrade(newMarket);
            newMarket.phase = "lucky777";
          }
          // Lucky 777 routine: try to do the 777 trade on the new token
          if (newMarket.phase === "lucky777") {
            console.log("2️⃣  Executing 'lucky777' routine for " + newMarket.symbol);
            if (!newMarket.price) {
              await OrderController.cancelAllOrders(newMarket.symbol);
              const candles = await Markets.getKLines(newMarket.symbol, "1m", 1);
              await this._doMarketTrade(newMarket);
              newMarket.totalTrades += Number(candles[0].trades);
              console.log("totalTrades: ", newMarket.totalTrades);
              if (newMarket.totalTrades > 777) {
                newMarket.phase = "clockingin";
                newMarket.clockinNextTime = Date.now() + 43200000;
              }
              const markPrices = await Markets.getAllMarkPrices(newMarket.symbol);
              await this._doMarketTrade(newMarket);
              newMarket.price = parseFloat(markPrices[0].markPrice);
            }
            const ordersBatch = this._generateOrdersBatch(newMarket, 5); //this.batchOrdersNum);
            await OrderController.createBatchOfMarketTriggerOrders(ordersBatch);
            newMarket.price = null;
          }
          // Clocking In: trade the new token for all 7 days after launch
          if (newMarket.phase === "clockingin" && Date.now() > newMarket.clockinNextTime) {
            console.log("3️⃣  Executing 'clocking in' routine for " + newMarket.symbol);
            await this._doMarketTrade(newMarket);
            newMarket.clockinOrdersSent += 1;
            newMarket.clockinNextTime += 43200000;
            if (newMarket.clockinOrdersSent > 16) {
              this.newMarkets.splice(i, 1);
              console.log("❇️  Completed all routines for " + newMarket.symbol);
            }
          }
        }
      }

      console.log("\n⚜️  Strategy evaluated. Possible orders placed and canceled.\n\n");
    } catch (error) {
      console.log(error);
    }
  }
}

export default Scanner;
