import OrderController from "../Controllers/OrderController.js";
import AccountStore from "../Store/AccountStore.js";
import Markets from "../Backpack/Markets.js";
import Utils from "../Utils/Utils.js";
import { logInfo } from "../Utils/logger.js";
import Helper from "./Helpers/Helper.js";
import { EventSource } from "eventsource";

class Signals2 {

  constructor() {
    this.availableMarkets = null;
    this.signalsQueue = [];
    this.eventSource = null;
    this.sseUrl = null;
    this.positions = new Map();
    this.onboarding = new Map();

    this.signalStrategy = String(process.env.SIGNAL_STRATEGY).trim().toUpperCase();

    this.authorizedMarkets = JSON.parse(process.env.AUTHORIZED_MARKETS) || [];
    this.maxOrderVolume = Number(process.env.ENTRY_VOLUME);
    this.multiplier = Number(String(process.env.MULTIPLIER).replace("x", "")) || 1;
    if (this.multiplier !== 1) {
      this.maxOrderVolume *= this.multiplier;
    }

    logInfo("Signals2 properties", this);
  }


  start() {
    this._initSSEReceiver();
    this._runCycleRoutine();

    setInterval(() => {
      console.log("Positions: " + Array.from(this.positions.keys()).join(", "));
      // Log of symbols added to queue
      console.log("Symbols added to queue: " + this.signalsQueue.map((el) => el.symbol).join(", "));
    }, 900000);

    // const candleTime = 900000;
    // const waitTime = candleTime - 2000 - (Date.now() % candleTime);
    // setTimeout(this._runCycleRoutine.bind(this), waitTime);
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

        // Skip signals from other strategies
        const strategyName = typeof data?.data?.strategyName === "string" ? data?.data?.strategyName.trim().toUpperCase() : "";
        if (strategyName !== this.signalStrategy) return;

        console.log("📨 Event received:", data);
        logInfo("Event received", data);

        // Process received signal
        if (data.type === "signal") this._processSignal(data.data);
        if (data.type === "positions") this._checkPositions(data.data?.msg);
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

  async _checkPositions(sigmaPositions) {
    if (typeof sigmaPositions === "string") {
      sigmaPositions = sigmaPositions.split(",").map((s) => s.trim()).filter((s) => s !== "");
    }

    if (Array.isArray(sigmaPositions)) {
      const sigmaSet = new Set(sigmaPositions);
      const localSet = new Set(this.positions.keys());
      const onlyInSigma = [...sigmaSet].filter(item => !localSet.has(item));
      const onlyInLocal = [...localSet].filter(item => !sigmaSet.has(item));

      if (onlyInSigma.length > 0 || onlyInLocal.length > 0) {
        const msg = `DESYNC! Only in sigma: ${onlyInSigma.join(", ")}. Only in local: ${onlyInLocal.join(", ")}`;
        console.log(msg);
        //Utils.notify(msg);
      }
    }
  }

  async _processSignal(signal) {
    // if (!this.availableMarkets) {
    //   this.signalsQueue.push(signal);
    //   return;
    // }
    await this._executeSignal(signal);
  }


  async _executeSignal(signal) {
    try {
      // if (!this.availableMarkets) {
      //   return;
      // }

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

      // if (this.authorizedMarkets.length === 0) {
      //   this.authorizedMarkets = AccountStore.markets.map((el) => el.symbol);
      // }

      //const positions = await AccountStore.getOpenFuturesPositions();
      //const inPositionMarkets = positions.map((el) => el.symbol);
      this.availableMarkets = AccountStore.markets.filter((el) => {
        const isAuthorized = this.authorizedMarkets.length === 0 || this.authorizedMarkets.includes(el.symbol);
        //const notInPosition = !inPositionMarkets.includes(el.symbol);
        return isAuthorized;
      });

      // if (this.signalsQueue.length > 0) {
      //   for (const signal of this.signalsQueue) {
      //     await this._executeSignal(signal);
      //   }
      // }

    } catch (error) {
      console.error("❌ Error running cicle routine:", error);
      logInfo("Error running cicle routine", { error: error.message });
    }
    /*finally {
      setTimeout(() => {
        this.availableMarkets = null;
        this.signalsQueue = [];
      }, 120000);

      const candleTime = 900000;
      const waitTime = candleTime - 2000 - (Date.now() % candleTime);
      setTimeout(this._runCycleRoutine.bind(this), waitTime);
    }*/
  }


  /*async _cancelEntryOrders(cancelMarkets) {
    for (const symbol of cancelMarkets) {
      const orders = await OrderController.getOpenOrders(symbol);
      for (const order of orders) {
        if (order.reduceOnly == false) {
          console.log(`▪️  Cancelling non-filled ${symbol} order. ${Utils.formatDateTime()}`);
          await OrderController.cancelOrder(order.symbol, order.id);
        }
      }
    }
  }*/


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
    order.volume = signal.volume * this.maxOrderVolume;
    order.stop = signal.stop;
    order.target = signal.target;
    order.action = signal.side === "buy" ? "long" : "short";

    if (signal.type === "entry-market") {
      this.onboarding.set(signal.symbol, true);
      // Detect simultaneous entry and exit signals within 50ms window
      await new Promise((resolve) => setTimeout(resolve, 50));
      let signalInQueue = this.signalsQueue.find((el) => el.id === signal.id)
      if (signalInQueue) {
        if (signalInQueue.type === "exit-market") {
          const msg = "Detected simultaneous entry and exit signals for " + signal.symbol + " Id: " + signal.id;
          console.log(msg);
          //Utils.notify(msg);
        }
        else {
          const msg = "(STRANGE BEHAVIOR) Detected simultaneous signals for " + signal.symbol + " Id: " + signal.id;
          console.log(msg);
          //Utils.notify(msg);
        }
        this.signalsQueue.splice(this.signalsQueue.indexOf(signalInQueue), 1);
        this.onboarding.set(signal.symbol, false);
        return;
      }

      // Execute entry order
      const result = await OrderController.openMarketOrder(order);
      console.log(">>>>> result: ", result)
      if (result?.status === "Filled") {
        this.positions.set(signal.symbol, { quantity: result.executedQuantity, side: order.action });
        console.log(`✅ Entry order filled for ${market.symbol}: entryPrice: ${signal.price}`);
        logInfo("Order filled", order);
      }

      // Execute signal for this symbol added to queue during onboarding
      this.onboarding.set(signal.symbol, false);
      signalInQueue = this.signalsQueue.find((el) => el.symbol === signal.symbol)
      if (signalInQueue) {
        const msg = `Detected ${signal.symbol} signal added to queue during onboarding. Executing signal.`;
        console.log(msg);
        //Utils.notify(msg);
        this.signalsQueue.splice(this.signalsQueue.indexOf(signalInQueue), 1);
        await this._executeSignal(signalInQueue);
      }
    } else if (signal.type === "exit-market") {
      // Add exit signals for this symbol to queue during onboarding
      if (this.onboarding.get(signal.symbol)) {
        console.log(`${signal.symbol} is onboarding, adding exit-signal to queue.`, signal);
        this.signalsQueue.push(signal);
        return;
      }

      // Execute exit order if position is open for this symbol
      const position = this.positions.get(signal.symbol);
      if (position) {
        order.quantity = position.quantity;
        order.action = position.side === "long" ? "short" : "long";
        const result = await OrderController.openMarketOrder(order);
        if (result?.status === "Filled") {
          this.positions.delete(signal.symbol);
          console.log(`✅ Exit order filled for ${market.symbol}: quantity: ${position.quantity}`);
          logInfo("Order filled", order);
        }
      }
    }
  }

}

export default Signals2;
