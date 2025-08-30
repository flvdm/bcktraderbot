import dotenv from "dotenv";
import MidCandle from "./src/Strategies/MidCandle.js";
import AccountStore from "./src/Store/AccountStore.js";
import System from "./src/Backpack/System.js";

dotenv.config();

const TRADING_STRATEGY = process.env.TRADING_STRATEGY;

console.log("");
console.log(":::::::::: 🦾 Starting BckTraderBot 🦿 ::::::::::");

const initResult = await AccountStore.init();
if (!initResult) {
  console.error("⚠️ Error getting Account stats. Stoping the bot.");
  process.exit(1);
}

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

  const backpackTime = await System.getSystemTime();
  let currentTime = Date.now();
  const timeDiff = backpackTime - currentTime;
  currentTime += timeDiff;
  let waitTime = candleTime - (currentTime % candleTime) + 1000;
  process.stdout.write("\n");
  console.log(`⏳ Waiting next ${timeframe} candle...`);
  await new Promise((resolve) => setTimeout(resolve, waitTime));
  runMidCandleStrategy();
} else {
  console.log("‼️ No Valid Strategy selected!");
}
