import WebSocket from "ws";

import OrderController from "../Controllers/OrderController.js";
import AccountStore from "../Store/AccountStore.js";
import Order from "../Backpack/Order.js";
import Utils from "../Utils/Utils.js";
import { logInfo, logError } from "../Utils/logger.js";
import Helper from "./Helpers/Helper.js";
import { buildWsSignature } from "../Backpack/Authentication.js";
import OrderBook from "../Backpack/OrderBook.js";


class ScalperHelper {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.lastOrderFill = null;
    this.lastPositionOpen = null;
    this.scalpItem = null;

    this.outTriggerBy = process.env.OUT_TRIGGER_BY?.toLowerCase() === "markprice" ? "MarkPrice" : "LastPrice";
    this.outOrderType = process.env.OUT_ORDER_TYPE === "limit" ? "limit" : "market";
    this.lossAmount = Number(process.env.LOSS_AMOUNT);
    this.profitAmount = Number(process.env.PROFIT_AMOUNT);
    this.slPercentage = Number(String(process.env.PERCENT_SL_LEVEL).replace("%", "")) / 100.0;
    this.tpPercentage = Number(String(process.env.PERCENT_TP_LEVEL).replace("%", "")) / 100.0;
    this.symbol = String(process.env.STRING_PARAM1).trim();
    this.profitPercentage = parseFloat(process.env.FLOAT_PARAM1) || null;
    this.enableOrderBook = process.env.BOOLEAN_PARAM1?.toLowerCase() === "true";
    if (this.symbol && this.profitPercentage && this.enableOrderBook) {
      this.orderBook = new OrderBook(this.symbol, { onUpdate: this._handleOrderBookUpdate.bind(this) });
    }

    logInfo("ScalperHelper initialized", {
      slPercentage: this.slPercentage,
      tpPercentage: this.tpPercentage,
      outTriggerBy: this.outTriggerBy,
      outOrderType: this.outOrderType,
    });
  }

  /**
   * Main run method - connects to WebSocket and listens for position updates
   */
  async start() {
    try {
      if (this.orderBook) await this.orderBook.start();
    } catch (error) {
      console.error("❌ ScalperHelper start orderBook error:", error.message);
      logError("ScalperHelper start orderBook error", error);
      this.orderBook.stop();
      this.orderBook = undefined;
    }

    try {

      this.ws = new WebSocket(process.env.WS_URL || "wss://ws.backpack.exchange");

      this.ws.on("open", () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // Subscribe to position updates - most important for detecting new positions
        const msg = {
          method: "SUBSCRIBE",
          params: ["account.positionUpdate", "account.orderUpdate"],
          signature: buildWsSignature(),
        };
        this.ws.send(JSON.stringify(msg));

        console.log("🛰  ScalperHelper WebSocket Connected!");
      });

      this.ws.on("message", async (raw) => {
        try {
          const msg = JSON.parse(raw);

          // Handle position updates
          if (msg.stream === "account.positionUpdate") {
            if (msg.data.e === "positionOpened") {
              // await this._handlePositionUpdate(msg.data);
              await this._handlePositionOpen(msg.data);
            }
            else if (msg.data.e === "positionAdjusted") {
              // console.log("positionAdjusted: ", msg.data);
            }
            else if (msg.data.e === "positionClosed") {
              // console.log("positionClosed: ", msg.data);
              if (msg.data.s === this.symbol) {
                this.scalpItem = null;
              }
            }
          }
          if (msg.stream === "account.orderUpdate") {
            if (msg.data.e === "orderFill") {
              await this._handleOrderFill(msg.data);
              //console.log("orderFill: ", msg.data);
            }
          }
        } catch (error) {
          console.error("❌ Error processing WebSocket message:", error.message);
          logError("WebSocket message processing error", error);
        }
      });

      this.ws.on("error", (err) => {
        console.error("❌ ScalperHelper WebSocket Error:", err.message);
        logError("ScalperHelper WebSocket Error", err);
      });

      this.ws.on("close", () => {
        this.isConnected = false;
        console.log("⚠️  ScalperHelper WebSocket disconnected.");

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * this.reconnectAttempts;
          console.log(`🔄 Reconnecting in ${delay / 1000}s... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.run(), delay);
        } else {
          console.error("❌ Max reconnection attempts reached. Please restart ScalperHelper manually.");
        }
      });
    } catch (error) {
      console.error("❌ ScalperHelper start error:", error.message);
      logError("ScalperHelper start error", error);
    }
  }

  async _handleOrderFill(data) {
    if (data.X !== "Filled" || data.s !== this.symbol || data.O !== "USER" || data.o !== "MARKET") {
      return;
    }

    this.lastOrderFill = {
      symbol: data.s,
      id: parseInt(data.i),
      price: parseFloat(data.L),
      quantity: data.q,
      isLong: data.S === "Bid",
      timestamp: data.T
    };

    if (this.lastPositionOpen) {
      console.log("_handleOrderFill compare lastOrderFill and lastPositionOpen", this.lastOrderFill, this.lastPositionOpen);
      if (Math.abs(this.lastPositionOpen.id - this.lastOrderFill.id) === 1) {
        await this._doTheScalperHelperMagic(this.lastOrderFill.symbol, this.lastOrderFill.price, this.lastOrderFill.quantity, this.lastOrderFill.isLong, this.lastOrderFill.timestamp);
      }
      else {
        console.log("_handleOrderFill No Match.");
        this.lastOrderFill = null;
        this.lastPositionOpen = null;
      }
    }
  }

  async _handlePositionOpen(data) {
    if (data.s !== this.symbol) {
      return;
    }

    this.lastPositionOpen = {
      symbol: data.s,
      id: data.i,
      price: parseFloat(data.B)
    }

    if (this.lastOrderFill) {
      console.log("_handlePositionOpen compare lastOrderFill and lastPositionOpen", this.lastOrderFill, this.lastPositionOpen);
      if (Math.abs(this.lastPositionOpen.id - this.lastOrderFill.id) === 1) {
        await this._doTheScalperHelperMagic(this.lastOrderFill.symbol, this.lastOrderFill.price, this.lastOrderFill.quantity, this.lastOrderFill.isLong, this.lastOrderFill.timestamp)
      }
      else {
        console.log("_handlePositionOpen No Match.");
        this.lastOrderFill = null;
        this.lastPositionOpen = null;
      }
    }
  }

  async _doTheScalperHelperMagic(symbol, entryPrice, quantity, isLong, timestamp) {
    try {
      console.log(`🆕 New position detected: ${symbol} at ${Utils.formatDateTime()}. ⚡ Adding SL/TP.`);

      this.lastPositionOpen = null;
      this.lastOrderFill = null;

      const market = AccountStore.markets.find((m) => m.symbol === symbol);
      if (!market) {
        console.error(`❌ Market properties not found for ${symbol}`);
        return;
      }
      this._calculateMarketProps(market, entryPrice);

      // Prepare  orderBook monitoring item
      const targetProfit = entryPrice * parseFloat(quantity) * this.profitPercentage;
      const exitPrice = isLong ?
        entryPrice + (targetProfit / parseFloat(quantity))
        : entryPrice - (targetProfit / parseFloat(quantity));

      this.scalpItem = {
        symbol: symbol,
        isLong: isLong,
        quantity: parseFloat(quantity),
        entryPrice: entryPrice,
        targetProfit: targetProfit,
        exitPrice: exitPrice,
        decimal_quantity: market.decimal_quantity,
        decimal_price: market.decimal_price,
        stepSize_quantity: market.stepSize_quantity,
        tickSize: market.tickSize,
      };

      // Prepare SL/TP order
      const slDistance = entryPrice * (this.slPercentage);
      const tpDistance = entryPrice * (this.tpPercentage);
      const slPrice = isLong ? entryPrice - slDistance : entryPrice + slDistance;
      const tpPrice = isLong ? entryPrice + tpDistance : entryPrice - tpDistance;

      let params = {};
      params.symbol = symbol;
      params.isLong = isLong;
      params.quantity = quantity;
      params.slPrice = slPrice;
      params.tpPrice = tpPrice;
      params.decimal_quantity = market.decimal_quantity;
      params.decimal_price = market.decimal_price;
      params.stepSize_quantity = market.stepSize_quantity;
      params.tickSize = market.tickSize;

      await this._executeSLAndTPOrder(params);

      const latencyMs = Date.now() - timestamp / 1000;
      console.log(`${symbol} TP and SL orders sent and results returned in (${latencyMs}ms latency)`);

    } catch (error) {
      console.error("❌ Error in _doTheScalperHelperMagic:", error.message);
    }
  }

  async _executeSLAndTPOrder({ symbol, isLong, quantity, slPrice, tpPrice, decimal_quantity, decimal_price, stepSize_quantity, tickSize }) {
    try {

      const slOrder = {
        symbol: symbol,
        action: isLong ? "short" : "long",
        quantity: quantity,
        triggerPrice: slPrice,
        decimal_quantity: decimal_quantity,
        decimal_price: decimal_price,
        stepSize_quantity: stepSize_quantity,
        tickSize: tickSize
      }

      const tpOrder = {
        symbol: symbol,
        action: isLong ? "short" : "long",
        quantity: quantity,
        triggerPrice: tpPrice,
        decimal_quantity: decimal_quantity,
        decimal_price: decimal_price,
        stepSize_quantity: stepSize_quantity,
        tickSize: tickSize
      }

      const [slResult, tpResult] = await Promise.all([
        OrderController.addPositionSLOrTPOrder(tpOrder),
        OrderController.addPositionSLOrTPOrder(slOrder)
      ]);

    } catch (error) {
      console.error("❌ Error in _executeSLAndTPOrder:", error.message);
      logError("❌ Error in _executeSLAndTPOrder", error);
    }
  }

  async _handleOrderBookUpdate(data) {
    try {
      if (!this.orderBook || !this.scalpItem) return;

      const pnl = this.orderBook.calculatePnL(this.scalpItem.entryPrice, this.scalpItem.quantity, this.scalpItem.isLong ? "long" : "short");
      //console.log(`PNL: ${pnl}`);

      if (pnl && pnl >= this.scalpItem.targetProfit) {
        console.log("_handleOrderBookUpdate: ✅ Target profit reached. Closing position.");

        const exitOrder = {
          symbol: this.scalpItem.symbol,
          action: this.scalpItem.isLong ? "short" : "long",
          quantity: this.scalpItem.quantity,
          decimal_quantity: this.scalpItem.decimal_quantity,
          decimal_price: this.scalpItem.decimal_price,
          stepSize_quantity: this.scalpItem.stepSize_quantity,
          tickSize: this.scalpItem.tickSize
        }

        this.scalpItem = null;
        const result = await OrderController.openMarketOrder(exitOrder);
        if (result?.status === "Filled") {
          const msg = `_handleOrderBookUpdate: ✅ Exit order filled for ${exitOrder.symbol}: quantity: ${exitOrder.quantity}`;
          console.log(msg);
          logInfo(msg);
        }
        else {
          const msg = `_handleOrderBookUpdate: ❌ Exit order not filled for ${exitOrder.symbol}: quantity: ${exitOrder.quantity}`;
          console.log(msg);
          logError(msg);
        }
      }

    } catch (error) {
      console.error("❌ Error in _handleOrderBookUpdate:", error.message);
      logError("❌ Error in _handleOrderBookUpdate", error);
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
      //console.log("Props inference for: " + market.symbol);
      const props = Helper.inferMarketProps(marketPrice);
      market.decimal_quantity = props.qtdHouses;
      market.decimal_price = props.prcHouses;
      market.stepSize_quantity = props.qtdStep;
      market.tickSize = props.prcStep;
      market.oldProps = oldProps;
    }
    Helper.checkMarketPropsFix(market);
  }

  /**
   * Gracefully stop the ScalperHelper
   */
  stop() {
    if (this.ws) {
      console.log("🛑 Stopping ScalperHelper...");
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }
}

export default ScalperHelper;
