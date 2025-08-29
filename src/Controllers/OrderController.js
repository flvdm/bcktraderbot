import Order from "../Backpack/Order.js";
import Utils from "../Utils/Utils.js";

class OrderController {
  async getOpenOrders(market) {
    const orders = await Order.getOpenOrders(market);
    if (orders) {
      const orderShorted = orders.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      return orderShorted.map((el) => {
        el.minutes = Utils.minutesAgo(el.createdAt);
        (el.triggerPrice = Number(el.triggerPrice)),
          (el.price = Number(el.price));
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
}

export default new OrderController();
