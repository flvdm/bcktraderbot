import axios from "axios";
import Utils from "../Utils/Utils";

class Markets {
  async getMarkets() {
    try {
      const response = await axios.get(`${process.env.API_URL}/api/v1/markets`);
      return response.data;
    } catch (error) {
      console.error("getMarkets ERROR", error.response?.data || error.message);
      return null;
    }
  }

  async getKLines(symbol, interval, limit) {
    if (!symbol) {
      console.error("symbol required");
      return null;
    }

    if (!interval) {
      console.error("interval required");
      return null;
    }

    if (!limit) {
      console.error("limit required");
      return null;
    }

    try {
      const now = Utils.roundToPreviousMinuteInterval(interval) / 1000;
      const duration = Utils.getIntervalInSeconds(interval) * limit;
      const startTime = now - duration;
      const endTime = now;

      const url = `${process.env.API_URL}/api/v1/klines`;

      const response = await axios.get(url, {
        params: {
          symbol,
          interval,
          startTime,
          endTime,
        },
      });

      const data = response.data;
      return data;
    } catch (error) {
      console.error("getKLines ERROR", error.response?.data || error.message);
      return null;
    }
  }
}

export default new Markets();
