class Helper {
  init() {
    this.marketPropsFixes = process.env.MARKET_PROPS_FIX ? JSON.parse(process.env.MARKET_PROPS_FIX) : [];
    this.marketPropsFixesSymbols = this.marketPropsFixes.map((el) => el.s);
    console.log(this.marketPropsFixes);
  }

  checkMarketPropsFix(market) {
    if (this.marketPropsFixesSymbols.length > 0 && this.marketPropsFixesSymbols.includes(market.symbol)) {
      const propsFix = this.marketPropsFixes.find((obj) => obj.s === market.symbol);
      if (propsFix) {
        if (propsFix.qh) market.decimal_quantity = propsFix.qh;
        if (propsFix.ph) market.decimal_price = propsFix.ph;
        if (propsFix.qs) market.stepSize_quantity = propsFix.qs;
        if (propsFix.ps) market.tickSize = propsFix.ps;
      }
    }
  }

  inferMarketProps(price) {
    const qtt = 1 / price;
    let qtdHouses = 5;
    for (let i = 0; i < 5; i++) {
      if ((qtt * 10 ** i).toFixed() >= 1) {
        qtdHouses = i;
        break;
      }
    }
    let prcHouses = 6;
    for (let i = 1; i < 6; i++) {
      if ((price * 10 ** i).toFixed() >= 1000) {
        prcHouses = i;
        break;
      }
    }
    const prcStep = 1 / 10 ** prcHouses;
    let n = qtdHouses;
    if (qtt >= 10) {
      n = n - Math.floor(Math.log10(qtt));
    }
    const qtdStep = 1 / 10 ** n;

    return {
      prcHouses,
      qtdHouses,
      prcStep,
      qtdStep,
    };
  }
}

export default new Helper();
