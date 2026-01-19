import dotenv from "dotenv";
import MidCandle from "./src/Strategies/MidCandle.js";
import Scanner from "./src/Strategies/Scanner.js";
import Signals from "./src/Strategies/Signals.js";
import AccountStore from "./src/Store/AccountStore.js";
import System from "./src/Backpack/System.js";
import { loggerInit, logInfo } from "./src/Utils/logger.js";
import Helper from "./src/Strategies/Helpers/Helper.js";
import Signals2 from "./src/Strategies/Signals2.js";

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: envFile });
global.isDebug = !!process.env.VSCODE_INSPECTOR_OPTIONS;

const instanceName = process.env.INSTANCE_NAME ? process.env.INSTANCE_NAME : "";

loggerInit(instanceName);

console.log("\n:::::::::: 🦾 Starting BckTraderBot 🦿 ::::::::::");
if (instanceName) console.log("Instance: " + instanceName);

const initResult = await AccountStore.init();
if (!initResult) {
  console.error("⚠️ Error getting Account stats. Stoping the bot.");
  process.exit(1);
}
Helper.init();

const tradingStrategy = process.env.TRADING_STRATEGY.toUpperCase();
const backpackTime = await System.getSystemTime();
let currentTime = Date.now();
const timeDiff = backpackTime - currentTime;
currentTime += timeDiff;
let candleTime;
let timeframe = process.env.TIMEFRAME;
logInfo(`Starting BckTradeBot ${instanceName} | ${tradingStrategy} ${timeframe}`);

if (tradingStrategy === "MIDCANDLE") {
  console.log(`🎲 Selected strategy: ${tradingStrategy}`);
  const midCandleStrategy = new MidCandle();

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
    case "10M":
      candleTime = 600_000;
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

    const waitTime = candleTime + 500 - ((Date.now() + timeDiff) % candleTime);
    setTimeout(runMidCandleStrategy, waitTime);
    console.log(`⏳ Waiting next ${timeframe} candle...`);
  }

  let waitTime = candleTime - (currentTime % candleTime) + 1000;
  if (global.isDebug) waitTime = 0;
  console.log(`\n⏳ Waiting next ${timeframe} candle...`);
  await new Promise((resolve) => setTimeout(resolve, waitTime));
  runMidCandleStrategy();
} //
else if (tradingStrategy === "SCANNER") {
  console.log(`🎲 Selected strategy: ${tradingStrategy}`);
  const scannerStrategy = new Scanner();

  async function runScannerStrategy() {
    const result = await scannerStrategy.run();
    if (result === "stop") return;

    //const waitTime = candleTime + 1000 - ((Date.now() + timeDiff) % candleTime);
    const waitTime = candleTime;
    setTimeout(runScannerStrategy, waitTime);
    //console.log(`⏳ Waiting next ${timeframe} candle...`);
  }

  timeframe = "1M";
  candleTime = 10000;
  let waitTime = candleTime - (currentTime % candleTime) + 1000;
  if (global.isDebug) waitTime = 0;
  console.log(`\n⏳ Waiting next ${timeframe} candle...`);
  await new Promise((resolve) => setTimeout(resolve, waitTime));
  runScannerStrategy();
} //
else if (tradingStrategy === "SIGNALS") {
  console.log(`🎲 Selected strategy: ${tradingStrategy}`);
  const signalsStrategy = new Signals();
  signalsStrategy.start();
} //
else if (tradingStrategy === "SIGNALS2") {
  console.log(`🎲 Selected strategy: ${tradingStrategy}`);
  const signalsStrategy = new Signals2();
  signalsStrategy.start();
} //
else {
  console.log("‼️ No Valid Strategy selected!");
}
