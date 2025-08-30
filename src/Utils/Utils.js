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
}

export default new Utils();
