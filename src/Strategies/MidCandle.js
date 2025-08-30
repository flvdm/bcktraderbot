import dotenv from "dotenv";
import OrderController from "../Controllers/OrderController";
import AccountStore from "../Store/AccountStore";
import Markets from "../Backpack/Public/Markets.js";
import Utils from "../Utils/Utils.js";
dotenv.config();

class MidCandle {
  constructor() {
    //keylevels
    this.entryLevel = parseFloat(process.env.FLOAT_PARAM1) || 0.5;
    this.stopLevel = parseFloat(process.env.FLOAT_PARAM2);
    this.targetLevel = parseFloat(process.env.FLOAT_PARAM3);

    //size loss profit
    this.maxOrderVolume = Number(process.env.ENTRY_VOLUME);
    this.minOrderVolume = Number(process.env.MIN_ENTRY_VOLUME);
    this.lossAmount = Number(process.env.LOSS_AMOUNT);
    this.profitAmount = Number(process.env.PROFIT_AMOUNT);
    this.slLevelByPercent = Number(String(process.env.PERCENT_SL_LEVEL).replace("%", "")) / 100.0;
    this.tpLevelByPercent = Number(String(process.env.PERCENT_TP_LEVEL).replace("%", "")) / 100.0;

    //retrictions
    this.authorizedMarkets = JSON.parse(process.env.AUTHORIZED_MARKETS);
    this.maxPositions = Number(process.env.MAX_POSITIONS) || 999;
    this.minPriceVariation = Number(String(process.env.MIN_PERCENT_VARIATION).replace("%", "")) / 100.0;
    this.entryDistanceLimiter = parseFloat(process.env.FLOAT_PARAM4);

    //modiifiers
    this.timeframe = String(process.env.TIMEFRAME).toLowerCase().trim();
    this.againstMovement = process.env.BOOLEAN_PARAM1?.toLowerCase() === "true";
    this.entryBooster = Number(String(process.env.ENTRY_BOOSTER).replace("x", "")) || 1;
    this.boosterMarkets = JSON.parse(process.env.BOOSTER_MARKETS);
  }

  async _cancelEntryOrders() {
    for (const symbol of this.authorizedMarkets) {
      const orders = await OrderController.getOpenOrders(symbol);
      for (const order of orders) {
        if (order.reduceOnly == false) {
          console.log(`▪️  Cancelling non-filled ${symbol} order. ${Utils.formatDateTime()}`);
          await OrderController.cancelOrder(order.symbol, order.id);
        }
      }
    }
  }

  async _getMarketsData(markets) {
    const marketsData = [];

    try {
      for (const market of markets) {
        const candles = await Markets.getKLines(market.symbol, this.timeframe, 2);
        if (!candles[1]) {
          console.log(`🔸 No data for ${market.symbol} candles:`, candles);
          continue;
        }
        const marketPrice = parseFloat(candles[1].close);

        const orderProperties = this._calculateOrderProperties(
          marketPrice,
          parseFloat(candles[1].high),
          parseFloat(candles[1].low),
          market.symbol
        );

        const d = new Date(candles[1].start);
        d.setHours(d.getHours() - 3);
        const candleTime = Utils.formatDateTime(d.getTime());
        console.log(`🔹 Getting market for ${market.symbol}. Candle time: ${candleTime}`);

        const data = {
          symbol: market.symbol,
          market,
          marketPrice,
          ...orderProperties,
        };
        marketsData.push(data);
      }
    } catch (error) {
      console.log(error);
    }

    return marketsData;
  }

  _calculateOrderProperties(marketPrice, high, low, symbol) {
    const calc = {};

    const candleLength = high - low;
    const entryLength = candleLength * this.entryLevel;
    calc.variation = high / low - 1;
    const midPrice = (high + low) / 2.0;

    calc.entryPrice = marketPrice < midPrice ? low + entryLength : high - entryLength;

    let stopLength;
    if (this.stopLevel) stopLength = candleLength * this.stopLevel;
    else if (this.slLevelByPercent) stopLength = calc.entryPrice * this.slLevelByPercent;
    else if (this.lossAmount) {
      stopLength = calc.entryPrice * (this.lossAmount / this.maxOrderVolume);
      calc.entryAmount = this.maxOrderVolume;
    }

    let targetLength = 0;
    if (this.targetLevel) targetLength = candleLength * this.targetLevel;
    else if (this.tpLevelByPercent) targetLength = calc.entryPrice * this.tpLevelByPercent;
    else if (this.profitAmount) {
      targetLength = calc.entryPrice * (this.profitAmount / this.maxOrderVolume);
      calc.entryAmount = this.maxOrderVolume;
    }

    let stopVariation;
    let targetVariation;

    if (marketPrice < midPrice) {
      const invert = calc.entryPrice < marketPrice;
      if (this.againstMovement !== invert) {
        calc.isLong = false;
        if (stopLength) {
          calc.stopPrice = calc.entryPrice + stopLength;
          stopVariation = calc.stopPrice / calc.entryPrice - 1;
        }
        if (targetLength) {
          calc.targetPrice = calc.entryPrice - targetLength;
          targetVariation = calc.entryPrice / calc.targetPrice - 1;
        }
      } else {
        calc.isLong = true;
        if (stopLength) {
          calc.stopPrice = calc.entryPrice - stopLength;
          stopVariation = calc.entryPrice / calc.stopPrice - 1;
        }
        if (targetLength) {
          calc.targetPrice = calc.entryPrice + targetLength;
          targetVariation = calc.targetPrice / calc.entryPrice - 1;
        }
      }
    } else {
      const invert = calc.entryPrice > marketPrice;
      if (this.againstMovement !== invert) {
        calc.isLong = true;
        if (stopLength) {
          calc.stopPrice = calc.entryPrice - stopLength;
          stopVariation = calc.entryPrice / calc.stopPrice - 1;
        }
        if (targetLength) {
          calc.targetPrice = calc.entryPrice + targetLength;
          targetVariation = calc.targetPrice / calc.entryPrice - 1;
        }
      } else {
        calc.isLong = false;
        if (stopLength) {
          calc.stopPrice = calc.entryPrice + stopLength;
          stopVariation = calc.stopPrice / calc.entryPrice - 1;
        }
        if (targetLength) {
          calc.targetPrice = calc.entryPrice - targetLength;
          targetVariation = calc.entryPrice / calc.targetPrice - 1;
        }
      }
    }

    calc.entryToMarketVariation =
      marketPrice > midPrice ? (marketPrice - low) / candleLength : (high - marketPrice) / candleLength;

    if (!calc.entryAmount) {
      if (this.lossAmount) calc.entryAmount = this.lossAmount / stopVariation;
      else if (this.profitAmount) calc.entryAmount = this.profitAmount / targetVariation;
      else calc.entryAmount = this.maxOrderVolume;
    }

    return calc;
  }

  async run() {
    try {
      console.log("\n📣 Previous candle closed. Running a new cicle of analysis.\n");

      //Cancel unfilled entry orders
      await this._cancelEntryOrders();

      //Check if entry volume is set
      if (Number.isNaN(this.maxOrderVolume)) {
        console.log("⚠️ No valid Entry Volume set. Stoping the bot.");
        return "stop";
      }

      //Check sufficient account balance for new orders
      const capitalAvailable = await AccountStore.getAvailableCapital();
      if (global.account.capitalAvailable < this.maxOrderVolume) {
        console.log("⚠️ Insuficient balance to open new orders. Stoping the bot.");
        return "stop";
      }

      //Retrieve openned positions and check max limits
      const positions = await AccountStore.getOpenFuturesPositions();
      const inPositionMarkets = positions.map((el) => el.symbol);
      if (inPositionMarkets.length >= this.maxPositions) {
        console.log("🔺 Max openned position limit reached. Skipping this candle...");
        return;
      }

      //Get market and candles data for all authorized symbols
      const avaibleMarkets = AccountStore.markets.filter((el) => {
        const isAuthorized = this.authorizedMarkets.length === 0 || this.authorizedMarkets.includes(el.symbol);
        const notInPosition = !inPositionMarkets.includes(el.symbol);
        return isAuthorized && notInPosition;
      });
      const marketsData = await this._getMarketsData(avaibleMarkets);

      console.log("\n⚜️  Strategy evaluated. Possible orders placed and canceled.\n\n");
    } catch (error) {
      console.log(error);
    }
  }
}

export default MidCandle;
