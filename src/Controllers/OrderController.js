import Order from "../Backpack/Order.js";
import Utils from "../Utils/Utils.js";
import { logInfo } from "../Utils/logger.js";
const tickSizeMultiply = 5;

class OrderController {
  async getOpenOrders(market) {
    const orders = await Order.getOpenOrders(market);
    if (orders) {
      const orderShorted = orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return orderShorted.map((el) => {
        el.minutes = Utils.minutesAgo(el.createdAt);
        (el.triggerPrice = Number(el.triggerPrice)), (el.price = Number(el.price));
        return el;
      });
    } else {
      return [];
    }
  }

  async cancelOrder(symbol, orderId, clientId) {
    try {
      await Order.cancelOpenOrder(symbol, orderId, clientId);
    } catch (err) {
      console.error("❌ cancelOrder ERROR", err.message, Utils.getFormatedCurrentDateTime(-3));
    }
  }

  async cancelAllOrders(symbol, orderType = "") {
    //orderType: "RestingLimitOrder" or "ConditionalOrder"
    try {
      await Order.cancelOpenOrders(symbol, orderType);
    } catch (err) {
      console.error("❌ cancelAllOrders ERROR", err.message, Utils.getFormatedCurrentDateTime(-3));
    }
  }

  async openMarketOrder({
    entry,
    stop,
    target,
    action,
    symbol,
    volume,
    decimal_quantity,
    decimal_price,
    stepSize_quantity,
    tickSize,
    quantity,
  }) {
    try {
      const isLong = action === "long";
      const side = isLong ? "Bid" : "Ask";

      const formatPrice = (value) => parseFloat(value).toFixed(decimal_price).toString();
      const formatQuantity = (value) => parseFloat(value).toFixed(decimal_quantity).toString();

      const entryPrice = parseFloat(entry);
      if (!quantity) quantity = formatQuantity(Math.floor(volume / entryPrice / stepSize_quantity) * stepSize_quantity);

      const body = {
        symbol: symbol,
        side,
        orderType: "Market",
        clientId: Math.floor(Math.random() * 1000000),
        quantity,
      };

      // const space = tickSize * tickSizeMultiply;
      // const takeProfitTriggerPrice = isLong ? target - space : target + space;
      // const stopLossTriggerPrice = isLong ? stop + space : stop - space;

      let outTriggerBy = process.env.OUT_TRIGGER_BY;
      if (outTriggerBy) {
        outTriggerBy = outTriggerBy.toLowerCase() === "markprice" ? "MarkPrice" : "LastPrice";
      } else {
        outTriggerBy = "LastPrice";
      }

      const outMakerOrder = process.env.OUT_ORDER_TYPE === "limit" ? true : false;

      if (target !== undefined && !isNaN(parseFloat(target))) {
        body.takeProfitTriggerBy = outTriggerBy;
        body.takeProfitTriggerPrice = formatPrice(target);
        if (outMakerOrder) body.takeProfitLimitPrice = formatPrice(target);
      }

      if (stop !== undefined && !isNaN(parseFloat(stop))) {
        body.stopLossTriggerBy = outTriggerBy;
        body.stopLossTriggerPrice = formatPrice(stop);
        if (outMakerOrder) body.stopLossLimitPrice = formatPrice(stop);
      }

      logInfo("openMarketOrder body: ", body);
      return await Order.executeOrder(body);
    } catch (error) {
      console.log("❌ openMarketOrder ERROR", error, Utils.getFormatedCurrentDateTime(-3));
    }
  }

  async createLimitTriggerOrder({
    entry,
    stop,
    target,
    action,
    symbol,
    volume,
    decimal_quantity,
    decimal_price,
    stepSize_quantity,
    tickSize,
    quantity,
  }) {
    try {
      const formatPrice = (value) => parseFloat(value).toFixed(decimal_price).toString();
      const formatQuantity = (value) => parseFloat(value).toFixed(decimal_quantity).toString();

      const isLong = action === "long";
      const side = isLong ? "Bid" : "Ask";

      if (!quantity)
        quantity = formatQuantity(Math.floor(volume / parseFloat(entry) / stepSize_quantity) * stepSize_quantity);
      const entryPrice = formatPrice(entry);

      let entryTriggerPrice = isLong ? entry - tickSize : entry + tickSize;
      entryTriggerPrice = formatPrice(entryTriggerPrice);
      entryTriggerPrice = formatPrice(entry);

      let inTriggerBy = process.env.IN_TRIGGER_BY;
      if (inTriggerBy) {
        inTriggerBy = inTriggerBy.toLowerCase() === "markprice" ? "MarkPrice" : "LastPrice";
      } else {
        inTriggerBy = "LastPrice";
      }

      const body = {
        symbol,
        orderType: "Limit",
        side,
        price: entryPrice,
        postOnly: false,
        reduceOnly: false,
        timeInForce: "GTC",
        triggerBy: inTriggerBy,
        triggerPrice: entryTriggerPrice,
        triggerQuantity: quantity,
      };

      let outTriggerBy = process.env.OUT_TRIGGER_BY;
      if (outTriggerBy) {
        outTriggerBy = outTriggerBy.toLowerCase() === "markprice" ? "MarkPrice" : "LastPrice";
      } else {
        outTriggerBy = "LastPrice";
      }

      const outMakerOrder = process.env.OUT_ORDER_TYPE === "limit" ? true : false;

      if (target !== undefined && !isNaN(parseFloat(target))) {
        body.takeProfitTriggerBy = outTriggerBy;
        body.takeProfitTriggerPrice = formatPrice(target);
        if (outMakerOrder) body.takeProfitLimitPrice = formatPrice(target);
      }

      if (stop !== undefined && !isNaN(parseFloat(stop))) {
        body.stopLossTriggerBy = outTriggerBy;
        body.stopLossTriggerPrice = formatPrice(stop);
        if (outMakerOrder) body.stopLossLimitPrice = formatPrice(stop);
      }

      logInfo("createLimitTriggerOrder body: ", body);
      return await Order.executeOrder(body);
    } catch (err) {
      console.error("❌ createLimitTriggerOrder ERROR", err.message, Utils.getFormatedCurrentDateTime(-3));
    }
  }

  async createMarketTriggerOrder({
    entry,
    stop,
    target,
    action,
    symbol,
    volume,
    decimal_quantity,
    decimal_price,
    stepSize_quantity,
    tickSize,
    quantity,
  }) {
    try {
      const formatPrice = (value) => parseFloat(value).toFixed(decimal_price).toString();
      const formatQuantity = (value) => parseFloat(value).toFixed(decimal_quantity).toString();

      const isLong = action === "long";
      const side = isLong ? "Bid" : "Ask";
      const entryPrice = parseFloat(entry);
      if (!quantity) quantity = formatQuantity(Math.floor(volume / entryPrice / stepSize_quantity) * stepSize_quantity);
      //const space = tickSize * tickSizeMultiply;
      //const entryTriggerPrice = isLong ? entry - space : entry + space;

      const body = {
        symbol,
        orderType: "Market",
        side,
        reduceOnly: false,
        timeInForce: "GTC",
        triggerBy: "LastPrice",
        //triggerPrice: formatPrice(entryTriggerPrice),
        triggerPrice: formatPrice(entry),
        triggerQuantity: quantity,
      };

      // const takeProfitTriggerPrice = isLong ? target - space : target + space;
      // const stopLossTriggerPrice = isLong ? stop + space : stop - space;

      let outTriggerBy = process.env.OUT_TRIGGER_BY;
      if (outTriggerBy) {
        outTriggerBy = outTriggerBy.toLowerCase() === "markprice" ? "MarkPrice" : "LastPrice";
      } else {
        outTriggerBy = "LastPrice";
      }

      const outMakerOrder = process.env.OUT_ORDER_TYPE === "limit" ? true : false;

      if (target !== undefined && !isNaN(parseFloat(target))) {
        body.takeProfitTriggerBy = outTriggerBy;
        //body.takeProfitTriggerPrice = formatPrice(takeProfitTriggerPrice);
        body.takeProfitTriggerPrice = formatPrice(target);
        if (outMakerOrder) body.takeProfitLimitPrice = formatPrice(target);
      }

      if (stop !== undefined && !isNaN(parseFloat(stop))) {
        body.stopLossTriggerBy = outTriggerBy;
        //body.stopLossTriggerPrice = formatPrice(stopLossTriggerPrice);
        body.stopLossTriggerPrice = formatPrice(stop);
        if (outMakerOrder) body.stopLossLimitPrice = formatPrice(stop);
      }

      logInfo("createMarketTriggerOrder body: ", body);
      return await Order.executeOrder(body);
    } catch (err) {
      console.error("❌ createMarketTriggerOrder ERROR", err.message, Utils.getFormatedCurrentDateTime(-3));
    }
  }

  async createTestOrder() {
    try {
      const decimal_price = 1;
      const decimal_quantity = 5;
      const stepSize_quantity = 0.00001;

      const formatPrice = (value) => parseFloat(value).toFixed(decimal_price).toString();
      const formatQuantity = (value) => parseFloat(value).toFixed(decimal_quantity).toString();

      const qnt = formatQuantity(Math.floor(0.0005 / stepSize_quantity) * stepSize_quantity);

      const body = {
        symbol: "BTC_USDC_PERP",
        orderType: "Market",
        side: "Bid",
        reduceOnly: false,
        timeInForce: "GTC",
        triggerBy: "MarkPrice",
        triggerPrice: formatPrice("113770"),
        triggerQuantity: qnt,
      };

      await Order.executeOrder(body);
    } catch (err) {
      console.error("❌ createTestOrder ERROR", err.message, Utils.getFormatedCurrentDateTime(-3));
    }
  }

  async createBatchOfMarketTriggerOrders(ordersArray) {
    try {
      const formatPrice = (value, decimal_price) => parseFloat(value).toFixed(decimal_price).toString();
      const formatQuantity = (value, decimal_quantity) => parseFloat(value).toFixed(decimal_quantity).toString();
      const formatedOrders = [];
      for (const order of ordersArray) {
        order.decimal_price = Number(order.decimal_price);
        order.decimal_quantity = Number(order.decimal_quantity);
        order.stepSize_quantity = parseFloat(order.stepSize_quantity);
        order.tickSize = parseFloat(order.tickSize);
        const isLong = order.action === "long";
        const side = isLong ? "Bid" : "Ask";
        const entryPrice = parseFloat(order.entry);
        const qnt =
          formatQuantity(order.quantity, order.decimal_quantity) ||
          formatQuantity(
            Math.floor(order.volume / entryPrice / order.stepSize_quantity) * order.stepSize_quantity,
            order.decimal_quantity
          );
        const space = order.tickSize * 1;
        const entryTriggerPrice = isLong ? order.entry - space : order.entry + space;

        const body = {
          symbol: order.symbol,
          orderType: "Market",
          side,
          reduceOnly: false,
          timeInForce: "GTC",
          triggerBy: "LastPrice",
          triggerPrice: formatPrice(entryTriggerPrice, order.decimal_price),
          triggerQuantity: qnt,
        };

        const takeProfitTriggerPrice = isLong ? order.target - space : order.target + space;
        const stopLossTriggerPrice = isLong ? order.stop + space : order.stop - space;

        let outTriggerBy = process.env.OUT_TRIGGER_BY;
        if (outTriggerBy) {
          outTriggerBy = outTriggerBy.toLowerCase() === "markprice" ? "MarkPrice" : "LastPrice";
        } else {
          outTriggerBy = "LastPrice";
        }
        const outMakerOrder = process.env.OUT_ORDER_TYPE === "limit" ? true : false;

        if (order.target !== undefined && !isNaN(order.target)) {
          body.takeProfitTriggerBy = outTriggerBy;
          body.takeProfitTriggerPrice = formatPrice(takeProfitTriggerPrice, order.decimal_price);
          if (outMakerOrder) body.takeProfitLimitPrice = formatPrice(order.target);
        }

        if (order.stop !== undefined && !isNaN(order.stop)) {
          body.stopLossTriggerBy = outTriggerBy;
          body.stopLossTriggerPrice = formatPrice(stopLossTriggerPrice, order.decimal_price);
          if (outMakerOrder) body.stopLossLimitPrice = formatPrice(order.stop);
        }

        formatedOrders.push(body);
      }
      logInfo("createBatchOfMarketTriggerOrders formatedOrders: ", formatedOrders);
      return await Order.executeOrdersBatch(formatedOrders);
    } catch (err) {
      console.error("❌ createBatchOfMarketTriggerOrders ERROR", err.message, Utils.getFormatedCurrentDateTime(-3));
    }
  }

  async openOrderSpot({ side, symbol, volume, quantity, decimal_quantity, decimal_price }) {
    try {
      const body = {
        symbol: symbol,
        side,
        orderType: "Market",
        timeInForce: "GTC",
        selfTradePrevention: "RejectTaker",
      };

      if (quantity) {
        body.quantity = decimal_quantity ? parseFloat(quantity).toFixed(decimal_quantity).toString() : quantity;
      } else {
        body.quoteQuantity = decimal_price ? parseFloat(volume).toFixed(decimal_price).toString() : decimal_price;
      }

      logInfo("openOrderSpot body: ", body);
      return await Order.executeOrder(body);
    } catch (error) {
      console.log(error, Utils.getFormatedCurrentDateTime(-3));
    }
  }
}

export default new OrderController();
