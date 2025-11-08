import Account from "../Backpack/Account.js";
import Position from "../Backpack/Position.js";
import Markets from "../Backpack/Markets.js";
import Utils from "../Utils/Utils.js";

class AccountStore {
  constructor() {
    this.makerFee = null;
    this.takerFee = null;
    this.leverage = null;
    this.markets = [];
  }

  async init() {
    try {
      const account = await Account.getAccount();
      this.makerFee = parseFloat(account.futuresMakerFee) / 10000;
      this.takerFee = parseFloat(account.futuresTakerFee) / 10000;
      this.leverage = parseInt(account.leverageLimit);
      this.markets = await this.getMarkets();
      return true;
    } catch (error) {
      console.log(error, Utils.getFormatedCurrentDateTime(-3));
      return false;
    }
  }

  async getMarkets(marketType = "PERP", orderBookState = "Open") {
    try {
      let markets = await Markets.getMarkets();

      markets = markets.filter((el) => {
        const mtMatch = marketType ? el.marketType === marketType : true;
        const obsMatch = orderBookState ? el.orderBookState === orderBookState : true;
        return mtMatch && obsMatch;
      });

      markets = markets.map((el) => {
        let stepSize = String(el.filters.quantity.stepSize);
        let tickSize = String(el.filters.price.tickSize);

        let decimal_quantity;
        if (stepSize.includes(".")) decimal_quantity = stepSize.split(".")[1].length;
        else stepSize = 0;

        let decimal_price;
        if (tickSize.includes(".")) decimal_price = tickSize.split(".")[1].length;
        else tickSize = 0;

        return {
          symbol: el.symbol,
          decimal_quantity,
          decimal_price,
          stepSize_quantity: Number(stepSize),
          tickSize: Number(tickSize),
        };
      });

      return markets;
    } catch (error) {
      console.log(error, Utils.getFormatedCurrentDateTime(-3));
      return null;
    }
  }

  async updateMarketsList() {
    try {
      const updatedMarkets = await this.getMarkets();
      if (Array.isArray(updatedMarkets) && updatedMarkets.length > 0) {
        this.markets = updatedMarkets;
      }
    } catch (error) {
      console.log(error, Utils.getFormatedCurrentDateTime(-3));
    }
  }

  async getAvailableCapital() {
    try {
      const collateral = await Account.getCollateral();
      const capitalAvailable = parseFloat(collateral.netEquityAvailable) * this.leverage * 0.95;
      return capitalAvailable;
    } catch (error) {
      console.log(error, Utils.getFormatedCurrentDateTime(-3));
    }
  }

  async getOpenFuturesPositions() {
    try {
      const positions = await Position.getOpenPositions();
      return positions;
    } catch (error) {
      console.log(error, Utils.getFormatedCurrentDateTime(-3));
    }
  }
}

export default new AccountStore();
