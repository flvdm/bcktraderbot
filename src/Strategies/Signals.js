import OrderController from "../Controllers/OrderController.js";
import AccountStore from "../Store/AccountStore.js";
import Markets from "../Backpack/Markets.js";
import Utils from "../Utils/Utils.js";
import { logInfo } from "../Utils/logger.js";
import Helper from "./Helpers/Helper.js";
import { EventSource } from "eventsource";

class Signals {

  constructor() {
    this.availableMarkets = null;
    this.signalsQueue = [];
    this.eventSource = null;
    this.sseUrl = null;

    this.authorizedMarkets = JSON.parse(process.env.AUTHORIZED_MARKETS) || [];
    this.maxOrderVolume = Number(process.env.ENTRY_VOLUME);
    this.multiplier = Number(String(process.env.MULTIPLIER).replace("x", "")) || 1;
    if (this.multiplier !== 1) {
      this.maxOrderVolume *= this.multiplier;
    }

    logInfo("Signals properties", this);
  }


  start() {
    this._initSSEReceiver();

    const candleTime = 900000;
    const waitTime = candleTime - 2000 - (Date.now() % candleTime);
    setTimeout(this._runCycleRoutine.bind(this), waitTime);
  }


  _initSSEReceiver() {
    // SSE endpoint URL - configurable via env variable
    const sseUrl = process.env.SSE_SIGNALS_URL || "http://localhost:3003/events";

    console.log(`🔌 Connecting to SSE endpoint: ${sseUrl}`);

    // Create EventSource connection
    this.eventSource = new EventSource(sseUrl);

    // Handler for when connection is opened
    this.eventSource.onopen = () => {
      console.log("✅ SSE connection established successfully");
      logInfo("SSE connection opened", { url: sseUrl, timestamp: new Date().toISOString() });
    };

    /*// Listen for custom event types (common in SSE servers)
    this.eventSource.addEventListener('connected', (event) => {
      console.log(`📨 CUSTOM EVENT received:`, event);
      const data = JSON.parse(event.data);
      console.log(`Event data:`, data);
    });*/

    // Handler for received messages
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📨 Event received:", data);
        logInfo("Event received", data);

        // Process received signal
        if (data.type === "signal") this._processSignal(data.data);
      } catch (error) {
        console.error("❌ Error processing SSE message:", error);
        logInfo("SSE message processing error", { error: error.message, data: event.data });
      }
    };

    // Handler for errors
    this.eventSource.onerror = (error) => {
      console.error("❌ SSE connection error:", error);
      logInfo("SSE connection error", {
        error: error.message || "Unknown error",
        readyState: this.eventSource.readyState,
        timestamp: new Date().toISOString()
      });

      // If connection was closed, attempt to reconnect after delay
      if (this.eventSource.readyState === EventSource.CLOSED) {
        console.log("🔄 SSE connection closed. Attempting to reconnect in 5 seconds...");
        this.eventSource.close();
        setTimeout(() => {
          console.log("🔄 Reconnecting to SSE endpoint...");
          this._initSSEReceiver();
        }, 5000);
      }
    };

    // Store URL for possible later use
    this.sseUrl = sseUrl;
  }


  async _processSignal(signal) {
    if (!this.availableMarkets) {
      this.signalsQueue.push(signal);
      return;
    }
    await this._executeSignal(signal);
  }


  async _executeSignal(signal) {
    try {
      if (!this.availableMarkets) {
        return;
      }

      const symbol = this._convertSymbol(signal.symbol);
      const market = this.availableMarkets.find((el) => el.symbol === symbol);

      if (market) {
        this._calculateMarketProps(market, signal.price);
        await this._executeOrder(market, signal);
      }

    } catch (error) {
      console.error("❌ Error executing signal:", error);
      logInfo("Signal execution error", { error: error.message, signal: signal });
    }
  }


  async _runCycleRoutine() {
    try {
      await AccountStore.updateMarketsList();

      //Cancel unfilled entry orders
      let cancelMarkets = this.authorizedMarkets;
      if (this.authorizedMarkets.length === 0) {
        cancelMarkets = AccountStore.markets.map((el) => el.symbol);
      }
      await this._cancelEntryOrders(cancelMarkets);

      const positions = await AccountStore.getOpenFuturesPositions();
      const inPositionMarkets = positions.map((el) => el.symbol);
      this.availableMarkets = AccountStore.markets.filter((el) => {
        const isAuthorized = this.authorizedMarkets.length === 0 || this.authorizedMarkets.includes(el.symbol);
        const notInPosition = !inPositionMarkets.includes(el.symbol);
        return isAuthorized && notInPosition;
      });

      if (this.signalsQueue.length > 0) {
        for (const signal of this.signalsQueue) {
          await this._executeSignal(signal);
        }
      }

    } catch (error) {
      console.error("❌ Error running cicle routine:", error);
      logInfo("Error running cicle routine", { error: error.message });
    }
    finally {
      setTimeout(() => {
        this.availableMarkets = null;
        this.signalsQueue = [];
      }, 120000);

      const candleTime = 900000;
      const waitTime = candleTime - 2000 - (Date.now() % candleTime);
      setTimeout(this._runCycleRoutine.bind(this), waitTime);
    }
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


  _calculateMarketProps(market, marketPrice) {
    let oldProps = null;
    if (market.decimal_quantity === undefined || market.stepSize_quantity === 0) {
      oldProps = {
        decimal_quantity: market.decimal_quantity,
        decimal_price: market.decimal_price,
        stepSize_quantity: market.stepSize_quantity,
        tickSize: market.tickSize,
      };
      console.log("Props inference for: " + market.symbol);
      const props = Helper.inferMarketProps(marketPrice);
      market.decimal_quantity = props.qtdHouses;
      market.decimal_price = props.prcHouses;
      market.stepSize_quantity = props.qtdStep;
      market.tickSize = props.prcStep;
      market.oldProps = oldProps;
    }
    Helper.checkMarketPropsFix(market);
  }


  _convertSymbol(symbol) {
    const parts = symbol.split("-");
    let base = parts[0];
    if (base === "1000PEPE") base = "kPEPE";
    if (base === "1000SHIB") base = "kSHIB";
    if (base === "1000BONK") base = "kBONK";
    return `${base}_USDC_PERP`;
  }


  async _executeOrder(market, signal) {
    let order = {};
    order.symbol = market.symbol;
    order.decimal_quantity = market.decimal_quantity;
    order.decimal_price = market.decimal_price;
    order.stepSize_quantity = market.stepSize_quantity;
    order.tickSize = market.tickSize;

    order.entry = signal.price;
    order.volume = signal.volume;
    order.stop = signal.stop;
    order.target = signal.target;
    order.action = signal.side === "buy" ? "long" : "short";

    console.log(`Valid ${order.action} order for ${market.symbol}: entryPrice: ${signal.price}`);
    logInfo("order", order);
    await OrderController.createLimitTriggerOrder(order);
  }

}

export default Signals;
