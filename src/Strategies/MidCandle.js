import dotenv from "dotenv";
dotenv.config();

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
    this.slLevelByPercent =
      Number(String(process.env.PERCENT_SL_LEVEL).replace("%", "")) / 100.0;
    this.tpLevelByPercent =
      Number(String(process.env.PERCENT_TP_LEVEL).replace("%", "")) / 100.0;

    //retrictions
    this.authorizedMarkets = JSON.parse(process.env.AUTHORIZED_MARKETS);
    this.maxPositions = Number(process.env.MAX_POSITIONS) || 999;
    this.minPriceVariation =
      Number(String(process.env.MIN_PERCENT_VARIATION).replace("%", "")) /
      100.0;
    this.entryDistanceLimiter = parseFloat(process.env.FLOAT_PARAM4);

    //modiifiers
    this.timeframe = String(process.env.TIMEFRAME).toLowerCase().trim();
    this.againstMovement = process.env.BOOLEAN_PARAM1?.toLowerCase() === "true";
    this.entryBooster =
      Number(String(process.env.ENTRY_BOOSTER).replace("x", "")) || 1;
    this.boosterMarkets = JSON.parse(process.env.BOOSTER_MARKETS);
  }

  async run() {
    try {
      console.log(
        "\n📣 Previous candle closed. Running a new cicle of analysis.\n"
      );

      //Do some logic

      console.log(
        "\n⚜️  Strategy evaluated. Possible orders placed and canceled.\n\n"
      );
    } catch (error) {
      console.log(error);
    }
  }
}

export default MidCandle;
