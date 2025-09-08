import OrderController from "../Controllers/OrderController.js";
import AccountStore from "../Store/AccountStore.js";
import Markets from "../Backpack/Markets.js";
import Utils from "../Utils/Utils.js";
import { logInfo } from "../Utils/logger.js";

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
    this.authorizedMarkets = JSON.parse(process.env.AUTHORIZED_MARKETS) || [];
    this.maxPositions = Number(process.env.MAX_POSITIONS) || 999;
    this.minPriceVariation = Number(String(process.env.MIN_PERCENT_VARIATION).replace("%", "")) / 100.0;
    this.entryDistanceLimiter = parseFloat(process.env.FLOAT_PARAM4);

    //modiifiers
    this.timeframe = String(process.env.TIMEFRAME).toLowerCase().trim();
    this.againstMovement = process.env.BOOLEAN_PARAM1?.toLowerCase() === "true";
    this.entryBoosterMultiplier = Number(String(process.env.ENTRY_BOOSTER).replace("x", "")) || 1;
    this.boosterMarkets = process.env.BOOSTER_MARKETS ? JSON.parse(process.env.BOOSTER_MARKETS) : [];

    logInfo("MidCandle properties", this);
  }

  async _cancelEntryOrders(cancelMarkets) {
    for (const symbol of cancelMarkets) {
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

        let oldProps = null;
        if (market.decimal_quantity === undefined || market.stepSize_quantity === 0) {
          oldProps = {
            decimal_quantity: market.decimal_quantity,
            decimal_price: market.decimal_price,
            stepSize_quantity: market.stepSize_quantity,
            tickSize: market.tickSize,
          };
          console.log("Props inference for: " + market.symbol);
          const props = Utils.inferMarketProps(marketPrice);
          market.decimal_quantity = props.qtdHouses;
          market.decimal_price = props.prcHouses;
          market.stepSize_quantity = props.qtdStep;
          market.tickSize = props.prcStep;
        }

        const data = {
          symbol: market.symbol,
          market,
          marketPrice,
          candle: candles[1],
          oldProps,
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

    calc.maxOrderVolume = this.maxOrderVolume;
    calc.minOrderVolume = this.minOrderVolume;
    calc.lossAmount = this.lossAmount;
    calc.profitAmount = this.profitAmount;
    if (this.boosterMarkets.includes(symbol)) {
      calc.maxOrderVolume *= this.entryBoosterMultiplier;
      calc.minOrderVolume *= this.entryBoosterMultiplier;
      calc.lossAmount *= this.entryBoosterMultiplier;
      calc.profitAmount *= this.entryBoosterMultiplier;
    }

    const candleLength = high - low;
    const entryLength = candleLength * this.entryLevel;
    calc.variation = high / low - 1;
    const midPrice = (high + low) / 2.0;

    calc.entryPrice = marketPrice < midPrice ? low + entryLength : high - entryLength;

    let stopLength;
    if (this.stopLevel) stopLength = candleLength * this.stopLevel;
    else if (this.slLevelByPercent) stopLength = calc.entryPrice * this.slLevelByPercent;
    else if (calc.lossAmount) {
      stopLength = calc.entryPrice * (calc.lossAmount / calc.maxOrderVolume);
      calc.entryAmount = calc.maxOrderVolume;
    }

    let targetLength = 0;
    if (this.targetLevel) targetLength = candleLength * this.targetLevel;
    else if (this.tpLevelByPercent) targetLength = calc.entryPrice * this.tpLevelByPercent;
    else if (calc.profitAmount) {
      targetLength = calc.entryPrice * (calc.profitAmount / calc.maxOrderVolume);
      calc.entryAmount = calc.maxOrderVolume;
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
      if (calc.lossAmount) calc.entryAmount = calc.lossAmount / stopVariation;
      else if (calc.profitAmount) calc.entryAmount = calc.profitAmount / targetVariation;
      else calc.entryAmount = calc.maxOrderVolume;
    }

    calc.candleLength = candleLength;
    calc.entryLength = entryLength;
    calc.midPrice = midPrice;
    calc.stopLength = stopLength;
    calc.targetLength = targetLength;
    calc.stopVariation = stopVariation;
    calc.targetVariation = targetVariation;

    return calc;
  }

  _evaluateEntry({ symbol, variation, entryToMarketVariation, entryAmount, maxOrderVolume, minOrderVolume }) {
    if (variation < this.minPriceVariation) {
      console.log(`🚫  Invalid: Price VARIATION is too LOW to cover trade fees.`);
      return { isValid: false };
    }

    if (entryToMarketVariation < this.entryDistanceLimiter) {
      console.log(`🚫  Invalid: Market price is TOO CLOSE the ENTRYPRICE.`);
      return { isValid: false };
    }

    if (entryAmount > maxOrderVolume || entryAmount < minOrderVolume) {
      console.log(`🚫  Invalid: Required AMOUNT OUT of LIMITS.`);
      return { isValid: false };
    }

    return { isValid: true };
  }

  async run() {
    try {
      console.log("\n📣 Previous candle closed. Running a new cicle of analysis.\n");

      //Cancel unfilled entry orders
      let cancelMarkets = this.authorizedMarkets;
      if (this.authorizedMarkets.length === 0) {
        cancelMarkets = AccountStore.markets.map((el) => el.symbol);
      }
      await this._cancelEntryOrders(cancelMarkets);

      //Check if entry volume is set
      if (Number.isNaN(this.maxOrderVolume)) {
        console.log("⚠️ No valid Entry Volume set. Stoping the bot.");
        return "stop";
      }

      //Check sufficient account balance for new orders
      const positions = await AccountStore.getOpenFuturesPositions();
      const capitalAvailable = await AccountStore.getAvailableCapital();
      logInfo("capitalAvailable", capitalAvailable);
      if (capitalAvailable < this.maxOrderVolume) {
        if (positions.length === 0) {
          console.log("⚠️ Insuficient balance to open new orders. Stoping the bot.");
          return "stop";
        } else {
          console.log("🔺 Low balance due openned positions. Skipping this candle...");
          return;
        }
      }

      //Retrieve openned positions and check max limits
      const inPositionMarkets = positions.map((el) => el.symbol);
      logInfo("inPositionMarkets", inPositionMarkets);
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
      logInfo("avaibleMarkets", avaibleMarkets);
      const marketsData = await this._getMarketsData(avaibleMarkets);
      logInfo("marketsData", marketsData);

      //Evaluate the strategy logic and prepare order
      for (const data of marketsData) {
        console.log("\n...Evaluating: " + data.market.symbol);
        const evaluationResult = this._evaluateEntry(data);
        console.log(
          `variation: ${data.variation.toFixed(8)}  |  minPriceVariation: ${this.minPriceVariation}\n` +
            `entryToMarketVariation: ${data.entryToMarketVariation.toFixed(8)}  |  entryDistanceLimiter: ${
              this.entryDistanceLimiter
            }\n` +
            `requiredAmount: ${data.entryAmount.toFixed(2)}  |  min and max Amount: ${data.minOrderVolume.toFixed(
              2
            )} & ${data.maxOrderVolume.toFixed(2)}`
        );

        if (evaluationResult.isValid) {
          let order = {};
          order.symbol = data.market.symbol;
          order.entry = data.entryPrice;
          order.decimal_quantity = data.market.decimal_quantity;
          order.decimal_price = data.market.decimal_price;
          order.stepSize_quantity = data.market.stepSize_quantity;
          order.tickSize = data.market.tickSize;
          order.volume = data.entryAmount;
          order.stop = data.stopPrice;
          order.target = data.targetPrice;
          order.action = data.isLong ? "long" : "short";
          console.log(`Valid long for ${data.symbol}: entryPrice: ${data.entryPrice}`);
          logInfo("order", order);

          await OrderController.createLimitTriggerOrder(order);
        }
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

export default MidCandle;
