import axios from "axios";
import { auth } from "./Authentication.js";
import Utils from "../Utils/Utils.js";

class Position {
  async getOpenPositions() {
    const timestamp = Date.now();
    const headers = auth({
      instruction: "positionQuery",
      timestamp,
    });
    try {
      const response = await axios.get(`${process.env.API_URL}/api/v1/position`, {
        headers,
      });
      return response.data;
    } catch (error) {
      console.error(
        "getOpenPositions ERROR",
        error.response?.data || error.message,
        Utils.getFormatedCurrentDateTime(-3)
      );
      return null;
    }
  }
}

export default new Position();
