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
