import Order from "../Backpack/Order.js";
import Utils from "../Utils/Utils.js";
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
      console.error("❌ cancelOrder ERROR", err.message);
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
  }) {
    try {
      const formatPrice = (value) => parseFloat(value).toFixed(decimal_price).toString();
      const formatQuantity = (value) => parseFloat(value).toFixed(decimal_quantity).toString();

      const isLong = action === "long";
      const side = isLong ? "Bid" : "Ask";
      const entryPrice = parseFloat(entry);
      const qnt = formatQuantity(Math.floor(volume / entryPrice / stepSize_quantity) * stepSize_quantity);
      const space = tickSize * tickSizeMultiply;
      const entryTriggerPrice = isLong ? entry - space : entry + space;

      const body = {
        symbol,
        orderType: "Limit",
        side,
        price: formatPrice(entry),
        postOnly: false,
        reduceOnly: false,
        timeInForce: "GTC",
        triggerBy: "LastPrice",
        triggerPrice: formatPrice(entryTriggerPrice),
        triggerQuantity: qnt,
      };

      const takeProfitTriggerPrice = isLong ? target - space : target + space;
      const stopLossTriggerPrice = isLong ? stop + space : stop - space;

      if (target !== undefined && !isNaN(parseFloat(target))) {
        body.takeProfitTriggerBy = "LastPrice";
        body.takeProfitTriggerPrice = formatPrice(takeProfitTriggerPrice);
        //body.takeProfitLimitPrice =  formatPrice(target);
      }

      if (stop !== undefined && !isNaN(parseFloat(stop))) {
        body.stopLossTriggerBy = "LastPrice";
        body.stopLossTriggerPrice = formatPrice(stopLossTriggerPrice);
        //body.stopLossLimitPrice = formatPrice(stop);
      }

      console.log("Order body: ", body);
      return await Order.executeOrder(body);
    } catch (err) {
      console.error("❌ Order creation error:", err.message);
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
  }) {
    try {
      const formatPrice = (value) => parseFloat(value).toFixed(decimal_price).toString();
      const formatQuantity = (value) => parseFloat(value).toFixed(decimal_quantity).toString();

      const isLong = action === "long";
      const side = isLong ? "Bid" : "Ask";
      const entryPrice = parseFloat(entry);
      const qnt = formatQuantity(Math.floor(volume / entryPrice / stepSize_quantity) * stepSize_quantity);
      const space = tickSize * tickSizeMultiply;
      const entryTriggerPrice = isLong ? entry - space : entry + space;

      const body = {
        symbol,
        orderType: "Market",
        side,
        reduceOnly: false,
        timeInForce: "GTC",
        triggerBy: "LastPrice",
        triggerPrice: formatPrice(entryTriggerPrice),
        triggerQuantity: qnt,
      };

      const takeProfitTriggerPrice = isLong ? target - space : target + space;
      const stopLossTriggerPrice = isLong ? stop + space : stop - space;

      if (target !== undefined && !isNaN(parseFloat(target))) {
        body.takeProfitTriggerBy = "LastPrice";
        body.takeProfitTriggerPrice = formatPrice(takeProfitTriggerPrice);
        //body.takeProfitLimitPrice =  formatPrice(target);
      }

      if (stop !== undefined && !isNaN(parseFloat(stop))) {
        body.stopLossTriggerBy = "LastPrice";
        body.stopLossTriggerPrice = formatPrice(stopLossTriggerPrice);
        //body.stopLossLimitPrice = formatPrice(stop);
      }

      return await Order.executeOrder(body);
    } catch (err) {
      console.error("❌ Order creation error:", err.message);
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
      console.error("❌ Order creation error:", err.message);
    }
  }
}

export default new OrderController();
