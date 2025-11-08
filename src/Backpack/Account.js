import axios from "axios";
import { auth } from "./Authentication.js";
import Utils from "../Utils/Utils.js";

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
      console.error("getAccount ERROR", error.response?.data || error.message, Utils.getFormatedCurrentDateTime(-3));
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
      console.error("getCollateral ERROR", error.response?.data || error.message, Utils.getFormatedCurrentDateTime(-3));
      return null;
    }
  }
}

export default new Account();
