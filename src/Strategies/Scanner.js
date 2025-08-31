import OrderController from "../Controllers/OrderController.js";
import AccountStore from "../Store/AccountStore.js";
import Markets from "../Backpack/Markets.js";
import Utils from "../Utils/Utils.js";

class Scanner {
  constructor() {
    this.orderVolume = Number(process.env.ENTRY_VOLUME);
    this.minOrderVolume = Number(process.env.MIN_ENTRY_VOLUME);
    this.slLevelByPercent = Number(String(process.env.PERCENT_SL_LEVEL).replace("%", "")) / 100.0;
    this.tpLevelByPercent = Number(String(process.env.PERCENT_TP_LEVEL).replace("%", "")) / 100.0;

    this.knownMarkets = JSON.parse(process.env.AUTHORIZED_MARKETS);
    this.newMarkets = [];

    this.maxPositions = Number(process.env.MAX_POSITIONS) || 999;
  }

  async run() {
    try {
      console.log("\n📣 Previous candle closed. Running a new cicle of analysis.\n");

      //Check if entry volume is set
      if (Number.isNaN(this.maxOrderVolume)) {
        console.log("⚠️ No valid Entry Volume set. Stoping the bot.");
        return "stop";
      }

      //Check sufficient account balance for new orders
      const capitalAvailable = await AccountStore.getAvailableCapital();
      if (capitalAvailable < this.maxOrderVolume) {
        console.log("⚠️ Insuficient balance to open new orders. Stoping the bot.");
        return "stop";
      }

      const currentMarkets = await AccountStore.getMarkets();
      // const cm = currentMarkets.map((el) => {
      //   return el.symbol;
      // });
      // console.log(cm);
      // return;

      const newMarkets = currentMarkets.filter((el) => {
        const isNew = !this.knownMarkets.includes(el.symbol);
        if (isNew) {
          this.knownMarkets.push(el.symbol);
          this.newMarkets.push({
            symbol: el.symbol,
            ordersSent: 0,
            phase: "first50",
          });
        }
        return isNew;
      });
      if (newMarkets.length > 0) {
        console.log("🌟 New market(s) FOUND!");
      } else {
        console.log("No new market found.");
      }

      if (this.newMarkets.length > 0) {
        for (const newMarket of newMarkets) {
          if (newMarket.phase === "first50") {
            const markPrices = await Markets.getAllMarkPrices(newMarket.symbol);
            const marketPrice = markPrices[0].markPrice;
            let order = {};
            order.symbol = newMarket.symbol;
            order.entry = marketPrice;
            order.decimal_quantity = newMarket.decimal_quantity;
            order.decimal_price = newMarket.decimal_price;
            order.stepSize_quantity = newMarket.stepSize_quantity;
            order.tickSize = newMarket.tickSize;
            order.volume = newMarket.stepSize_quantity * marketPrice;
            order.stop = marketPrice * 1.005;
            order.target = marketPrice * 0.995;
            order.action = "short";
            await OrderController.openMarketOrder(order);
            newMarket.phase = "cloackin";
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
