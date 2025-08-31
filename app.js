import dotenv from "dotenv";
import MidCandle from "./src/Strategies/MidCandle.js";
import Scanner from "./src/Strategies/Scanner.js";
import AccountStore from "./src/Store/AccountStore.js";
import System from "./src/Backpack/System.js";

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: envFile });

const TRADING_STRATEGY = process.env.TRADING_STRATEGY.toUpperCase();

console.log("");
console.log(":::::::::: 🦾 Starting BckTraderBot 🦿 ::::::::::");

const initResult = await AccountStore.init();
if (!initResult) {
  console.error("⚠️ Error getting Account stats. Stoping the bot.");
  process.exit(1);
}

const backpackTime = await System.getSystemTime();
let currentTime = Date.now();
const timeDiff = backpackTime - currentTime;
currentTime += timeDiff;
let timeframe = process.env.TIMEFRAME;

if (TRADING_STRATEGY === "MIDCANDLE") {
  console.log(`🎲 Selected strategy: ${TRADING_STRATEGY}`);
  const midCandleStrategy = new MidCandle();

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

  let waitTime = candleTime - (currentTime % candleTime) + 1000;
  console.log(`\n⏳ Waiting next ${timeframe} candle...`);
  await new Promise((resolve) => setTimeout(resolve, waitTime));
  runMidCandleStrategy();
} else if (TRADING_STRATEGY === "SCANNER") {
  console.log(`🎲 Selected strategy: ${TRADING_STRATEGY}`);
  const scannerStrategy = new Scanner();

  async function runScannerStrategy() {
    const result = await scannerStrategy.run();
    if (result === "stop") return;

    const waitTime = candleTime + 1000 - ((Date.now() + timeDiff) % candleTime);
    setTimeout(runScannerStrategy, waitTime);
    console.log(`⏳ Waiting next ${timeframe} candle...`);
  }

  timeframe = "1M";
  candleTime = 60000;
  let waitTime = candleTime - (currentTime % candleTime) + 1000;
  console.log(`\n⏳ Waiting next ${timeframe} candle...`);
  await new Promise((resolve) => setTimeout(resolve, waitTime));
  runScannerStrategy();
} else {
  console.log("‼️ No Valid Strategy selected!");
}
