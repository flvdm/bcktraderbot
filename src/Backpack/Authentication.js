import nacl from "tweetnacl";

export function auth({ instruction, params = {}, timestamp, window = 10000 }) {
  const result = {
    "X-API-Key": process.env.BACKPACK_API_KEY,
    "X-Timestamp": timestamp.toString(),
    "X-Window": window.toString(),
    "Content-Type": "application/json; charset=utf-8",
  };
  const privateKeySeed = Buffer.from(process.env.BACKPACK_API_SECRET, "base64");
  const keyPair = nacl.sign.keyPair.fromSeed(privateKeySeed);

  let payload = "";
  if (Array.isArray(params)) {
    for (const param of params) {
      const sortedParams = Object.keys(param)
        .sort()
        .map((key) => `${key}=${param[key]}`)
        .join("&");
      const baseStr = sortedParams ? "instruction=" + instruction + "&" + sortedParams : "";
      payload = payload + baseStr + "&";
    }
    payload = payload + "timestamp=" + timestamp + "&window=" + window;
  } else {
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");

    const baseStr = sortedParams ? "&" + sortedParams : "";
    payload = "instruction=" + instruction + baseStr + "&timestamp=" + timestamp + "&window=" + window;
  }

  const signature = nacl.sign.detached(Buffer.from(payload), keyPair.secretKey);

  result["X-Signature"] = Buffer.from(signature).toString("base64");

  return result;
}

/**
 * Builds a signature for an authenticated subscription message for Backpack WebSocket
 * @param {string[]} streams - Array of stream names to subscribe to
 * @param {number} window - Time window in milliseconds (default: 10000)
 * @returns [ publicKeyBase64, signatureBase64, timestamp, window ] Array with signature
 */
export function buildWsSignature(window = 10000) {
  const timestamp = Date.now();

  // Create the signing payload: instruction=subscribe&timestamp=<timestamp>&window=<window>
  const payload = `instruction=subscribe&timestamp=${timestamp}&window=${window}`;

  // Load keys from environment
  const privateKeySeed = Buffer.from(process.env.BACKPACK_API_SECRET, "base64");
  const keyPair = nacl.sign.keyPair.fromSeed(privateKeySeed);

  // Sign the payload
  const signature = nacl.sign.detached(Buffer.from(payload), keyPair.secretKey);

  // Encode signature and public key to base64
  const signatureBase64 = Buffer.from(signature).toString("base64");
  const publicKeyBase64 = Buffer.from(keyPair.publicKey).toString("base64");

  // Return the array with signature
  return [publicKeyBase64, signatureBase64, timestamp.toString(), window.toString()]
}
