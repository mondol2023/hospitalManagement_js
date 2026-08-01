'use strict';

/**
 * Per-socket event budget.
 *
 * HTTP throttling does not apply to a websocket: the connection is established
 * once and every message after that bypasses `express-rate-limit` entirely. Since
 * `chat:typing` fires on keystrokes, "a chatty client" and "a client hammering
 * the message collection" look identical from outside, and one socket can
 * otherwise saturate a worker's event loop for everybody sharing it.
 *
 * A fixed window rather than a sliding log: the log costs memory proportional to
 * traffic, which is the wrong shape for a defence against traffic. The worst case
 * here is that a client gets up to 2× the budget across a window boundary, which
 * is a burst allowance, not a hole.
 */
class RateGuard {
  /**
   * @param {object} [options]
   * @param {number} [options.limit=120] events per window
   * @param {number} [options.windowMs=10000]
   * @param {() => number} [options.now] injection seam for tests
   */
  constructor({ limit = 120, windowMs = 10_000, now = Date.now } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.count = 0;
    this.windowStart = now();
  }

  /** @returns {boolean} true when the event is within budget */
  hit() {
    const at = this.now();
    if (at - this.windowStart >= this.windowMs) {
      this.windowStart = at;
      this.count = 0;
    }
    this.count += 1;
    return this.count <= this.limit;
  }

  /** Seconds until the budget resets — quoted to the client in the error. */
  get retryAfterSeconds() {
    return Math.max(1, Math.ceil((this.windowStart + this.windowMs - this.now()) / 1000));
  }
}

module.exports = RateGuard;
module.exports.RateGuard = RateGuard;
