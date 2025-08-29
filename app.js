import dotenv from "dotenv";

dotenv.config();

const TRADING_STRATEGY = process.env.TRADING_STRATEGY;

console.log("");
console.log(":::::::::: 🦾 Starting BckTraderBot 🦿 ::::::::::");

if (TRADING_STRATEGY === "MIDCANDLE") {
  console.log(`🎲 Selected strategy: ${TRADING_STRATEGY}`);
  const midCandleStrategy = new MidCandle();
} else {
  console.log("‼️ No Valid Strategy selected!");
}
