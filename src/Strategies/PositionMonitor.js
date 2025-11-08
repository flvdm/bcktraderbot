import WebSocket from "ws";

import OrderController from "../Controllers/OrderController.js";
import AccountStore from "../Store/AccountStore.js";
import Markets from "../Backpack/Markets.js";
import Utils from "../Utils/Utils.js";
import { logInfo } from "../Utils/logger.js";
import Helper from "./Helpers/Helper.js";

class PositionMonitor {
  constructor() {
    this.ws = null;

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

    //modifiers
    this.timeframe = String(process.env.TIMEFRAME).toLowerCase().trim();
    this.againstMovement = process.env.BOOLEAN_PARAM1?.toLowerCase() === "true";
    this.entryBoosterMultiplier = Number(String(process.env.BOOSTER_MULTIPLIER).replace("x", "")) || 1;
    this.boosterMarkets = process.env.BOOSTER_MARKETS ? JSON.parse(process.env.BOOSTER_MARKETS) : [];

    this.multiplier = Number(String(process.env.MULTIPLIER).replace("x", "")) || 1;
    if (this.multiplier !== 1) {
      this.maxOrderVolume *= this.multiplier;
      this.minOrderVolume *= this.multiplier;
      this.lossAmount *= this.multiplier;
      this.profitAmount *= this.multiplier;
    }

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

  init() {
    a;
  }

  async run() {
    try {
      this.ws = new WebSocket(process.env.WS_URL);

      this.ws.on("open", () => {
        console.log("🛰 WebSocket Connected!");
        const msg = buildAuthSubscribe(["account.orderUpdate.*"]);
        this.ws.send(JSON.stringify(msg));
      });

      this.ws.on("message", async (raw) => {
        let msg;
        msg = JSON.parse(raw);

        if (msg.stream?.startsWith("account.orderUpdate")) {
          const d = msg.data;
          if (d.e === "orderFill") {
            console.log(`📩 Order filled: ${d.s} ${d.S} ${d.q}@${d.p}`);
            await handlePosition(d.s);
          }
        }
      });

      this.ws.on("error", (err) => console.error("WebSocket Error:", err.message));

      this.ws.on("close", () => {
        console.log("⚠️  WebSocket disconnected. Reconnecting...");
        setTimeout(this.run, 5000);
      });
    } catch (error) {
      console.log(error);
    }
  }
}

export default PositionMonitor;
