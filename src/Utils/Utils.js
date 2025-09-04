import axios from "axios";
import { promises as fs } from "fs";
import path from "path";
const dataDir = path.join(process.cwd(), "data");

class Utils {
  minutesAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    return Math.floor(diff / 60_000);
  }

  getIntervalInSeconds(interval) {
    if (typeof interval !== "string") return 60;

    const match = interval.match(/^(\d+)([smhd])$/i);
    if (!match) return 60;

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    const unitToSeconds = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return value * (unitToSeconds[unit] || 60);
  }

  formatDateTime(timestamp = Date.now()) {
    const date = new Date(timestamp);

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  }

  getFormatedCurrentDateTime(hourOffset, timestamp = Date.now()) {
    const date = new Date(timestamp);
    date.setHours(date.getHours() + hourOffset);
    return this.formatDateTime(date);
  }

  roundToPreviousMinuteInterval(interval, timestamp = Date.now()) {
    const match = interval.match(/^(\d+)([smhd])$/i);
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const unitToSeconds = {
      s: 0,
      m: 1,
      h: 60,
      d: 1440,
    };
    const intervalMinutes = value * unitToSeconds[unit];

    const MS_PER_MINUTE = 60 * 1000;
    const intervalMs = intervalMinutes * MS_PER_MINUTE;

    // Round down to the previous multiple of the interval
    const rounded = Math.floor(timestamp / intervalMs) * intervalMs;

    return rounded;
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
    const qtdStep = 1 / 10 ** qtdHouses;

    return {
      prcHouses,
      qtdHouses,
      prcStep,
      qtdStep,
    };
  }

  async notify(msg) {
    if (!process.env.DISCORD_WEBHOOK) console.log("notify: Notification URL not found.");
    try {
      await axios.post(process.env.DISCORD_WEBHOOK, { content: msg });
    } catch (error) {
      console.error("notify ERROR", error.response?.data || error.message);
    }
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (err) {
      if (err.code !== "ENOENT") console.error("Make Data Dir ERROR", err);
    }
  }

  async saveDataToFile(arr, fileName) {
    await this.ensureDataDir();
    const filePath = path.join(dataDir, fileName);
    try {
      await fs.writeFile(filePath, JSON.stringify(arr, null, 2), "utf-8");
    } catch (err) {
      if (err.code !== "ENOENT") console.error("saveDataToFile ERROR", err);
    }
  }

  async readDataFromFile(fileName) {
    const filePath = path.join(dataDir, fileName);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data);
    } catch (err) {
      if (err.code !== "ENOENT") console.error("readDataFromFile ERROR", err);
      return null;
    }
  }

  async deleteFile(fileName) {
    const filePath = path.join(dataDir, fileName);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== "ENOENT") console.error("deleteFile ERROR", err);
    }
  }
}

export default new Utils();
