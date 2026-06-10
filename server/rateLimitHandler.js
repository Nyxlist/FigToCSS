/**
 * FigmaRequestQueue — rate-limit-aware request queue.
 *
 * - Tracks requests per minute (Figma free tier: ~60 requests/min)
 * - Automatically throttles when approaching limit
 * - Re-queues requests that get 429 with Retry-After
 * - Exponential backoff on failures
 */

class FigmaRequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.requestsThisMinute = 0;
    this.lastReset = Date.now();
    this.maxPerMinute = 50; // Stay under Figma's 60/min limit
  }

  async enqueue(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject, attempts: 0 });
      this.process();
    });
  }

  async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      // Reset counter every minute
      if (Date.now() - this.lastReset >= 60000) {
        this.requestsThisMinute = 0;
        this.lastReset = Date.now();
      }

      // Throttle if approaching rate limit
      if (this.requestsThisMinute >= this.maxPerMinute) {
        const msUntilReset = 60000 - (Date.now() - this.lastReset);
        const waitTime = Math.max(msUntilReset, 2000);
        console.log(`[RateLimit] Throttling: ${this.requestsThisMinute}/${this.maxPerMinute} requests used. Waiting ${Math.round(waitTime / 1000)}s`);
        await this.delay(waitTime);
        continue;
      }

      const item = this.queue.shift();
      const { requestFn, resolve, reject, attempts } = item;
      this.requestsThisMinute++;

      try {
        const result = await requestFn();
        resolve(result);
      } catch (err) {
        if (err.status === 429) {
          // Rate limited — re-queue with delay
          const retryAfter = err.retryAfter || 30;
          console.log(`[RateLimit] 429 received. Retry-After: ${retryAfter}s`);
          await this.delay(retryAfter * 1000);
          this.queue.unshift({ requestFn, resolve, reject, attempts: attempts + 1 });
        } else if (attempts < 3 && (err.status >= 500 || err.code === 'TIMEOUT')) {
          // Server error or timeout — retry with backoff
          const backoff = 1000 * Math.pow(2, attempts);
          console.log(`[RateLimit] Retrying after ${backoff}ms (attempt ${attempts + 1}/3)`);
          await this.delay(backoff);
          this.queue.unshift({ requestFn, resolve, reject, attempts: attempts + 1 });
        } else {
          reject(err);
        }
      }
    }

    this.processing = false;
  }

  delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  getStatus() {
    return {
      queueLength: this.queue.length,
      requestsThisMinute: this.requestsThisMinute,
      maxPerMinute: this.maxPerMinute,
      processing: this.processing,
    };
  }
}

export default new FigmaRequestQueue();
