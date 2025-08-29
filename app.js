import dotenv from "dotenv";
import MidCandle from "./src/Strategies/MidCandle.js";

dotenv.config();

const TRADING_STRATEGY = process.env.TRADING_STRATEGY;

console.log("");
console.log(":::::::::: 🦾 Starting BckTraderBot 🦿 ::::::::::");

global.account = await AccountController.get();

if (TRADING_STRATEGY === "MIDCANDLE") {
  console.log(`🎲 Selected strategy: ${TRADING_STRATEGY}`);
  const midCandleStrategy = new MidCandle();

  let timeframe = process.env.TIMEFRAME;
  let candleTime;
  switch (timeframe) {
    case "1M":
      candleTime = 60_000;
      break;
    case "3M":
      candleTime = 180_000;
      break;
    case "5M":
      candleTime = 300_000;
      break;
    case "15M":
      candleTime = 900_000;
      break;
    case "30M":
      candleTime = 1_800_000;
      break;
    default:
      candleTime = 900_000;
      timeframe = "15M";
  }

  async function runMidCandleStrategy() {
    const result = await midCandleStrategy.run();
    if (result === "stop") return;

    const waitTime = candleTime + 1000 - ((Date.now() + timeDiff) % candleTime);
    setTimeout(runMidCandleStrategy, waitTime);
    console.log(`⏳ Waiting next ${timeframe} candle...`);
  }

  let currentTime = Date.now();
  let waitTime = candleTime - (currentTime % candleTime) + 1000;
  process.stdout.write("\n");
  console.log(`⏳ Waiting next ${timeframe} candle...`);
  await new Promise((resolve) => setTimeout(resolve, waitTime));
  runMidCandleStrategy();
} else {
  console.log("‼️ No Valid Strategy selected!");
}
