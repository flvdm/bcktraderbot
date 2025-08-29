class Utils {
  minutesAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    return Math.floor(diff / 60_000);
  }
}

export default new Utils();
