import axios from "axios";
import { auth } from "./Authentication.js";

class Account {
  async getAccount() {
    const timestamp = Date.now();

    const headers = auth({
      instruction: "accountQuery",
      timestamp,
      params: {},
    });

    try {
      const response = await axios.get(`${process.env.API_URL}/api/v1/account`, {
        headers,
      });

      return response.data;
    } catch (error) {
      console.error("getAccount ERROR", error.response?.data || error.message);
      return null;
    }
  }

  async getCollateral() {
    const timestamp = Date.now();

    const headers = auth({
      instruction: "collateralQuery",
      timestamp,
      params: {},
    });

    try {
      const response = await axios.get(`${process.env.API_URL}/api/v1/capital/collateral`, {
        headers,
      });

      return response.data;
    } catch (error) {
      console.error("getCollateral ERROR", error.response?.data || error.message);
      return null;
    }
  }

  async getMarkets() {
    try {
      const response = await axios.get(`${process.env.API_URL}/api/v1/markets`);
      return response.data;
    } catch (error) {
      console.error("getMarkets ERROR", error.response?.data || error.message);
      return null;
    }
  }
}

export default new Account();
