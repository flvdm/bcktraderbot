import winston from "winston";
import "winston-daily-rotate-file";

let loggerInstance = null;

export function loggerInit(appInstance = "default") {
  if (!appInstance) appInstance = "default";
  const dailyRotateTransport = new winston.transports.DailyRotateFile({
    filename: `logs/${appInstance}/${appInstance} %DATE%.log`,
    datePattern: "YYYY-MM-DD",
    zippedArchive: false,
    maxSize: "10m",
    maxFiles: "30d",
  });

  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      const formattedMessage = typeof message === "object" ? JSON.stringify(message, null, 2) : message;
      return `[${timestamp}] ${level.toUpperCase()}: ${formattedMessage}`;
    })
  );

  loggerInstance = winston.createLogger({
    level: "info",
    format: logFormat,
    transports: [dailyRotateTransport],
  });
}

export function logInfo(...args) {
  if (!loggerInstance) {
    throw new Error("Logger not initialized! Need to initialize logger with init(appName) first.");
  }
  loggerInstance.info(
    args
      .map((arg) => {
        return typeof arg === "object" ? JSON.stringify(arg, null, 2) : arg;
      })
      .join(" \n")
  );
}

export function logError(...args) {
  if (!loggerInstance) {
    throw new Error("Logger not initialized! Need to initialize logger with init(appName) first.");
  }
  loggerInstance.error(
    args
      .map((arg) => {
        return typeof arg === "object" ? JSON.stringify(arg, null, 2) : arg;
      })
      .join(" \n")
  );
}
