import https from "node:https";
import { performance } from "node:perf_hooks";

const target = new URL(process.env.LOAD_TEST_URL || "https://api.logistics.local/api/health");
const total = Number.parseInt(process.env.LOAD_TEST_REQUESTS || "100", 10);
const concurrency = Number.parseInt(process.env.LOAD_TEST_CONCURRENCY || "10", 10);

if (!Number.isInteger(total) || total < 1 || total > 10_000) throw new Error("LOAD_TEST_REQUESTS must be between 1 and 10000");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) throw new Error("LOAD_TEST_CONCURRENCY must be between 1 and 100");
if (target.protocol !== "https:") throw new Error("Only HTTPS targets are accepted");

function requestOnce() {
  const started = performance.now();
  return new Promise((resolve) => {
    const request = https.request(target, {
      method: "GET",
      rejectUnauthorized: process.env.LOAD_TEST_ALLOW_LOCAL_CA !== "true",
      timeout: 10_000,
      headers: { Accept: "application/json", "User-Agent": "logistics-local-load-test/1.0" },
    }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode, duration: performance.now() - started }));
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", () => resolve({ status: 0, duration: performance.now() - started }));
    request.end();
  });
}

const results = [];
let next = 0;
async function worker() {
  while (next < total) {
    next += 1;
    results.push(await requestOnce());
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
const elapsedSeconds = (performance.now() - started) / 1000;
const durations = results.map((result) => result.duration).sort((a, b) => a - b);
const percentile = (value) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)];
const failures = results.filter((result) => result.status < 200 || result.status >= 300);

console.log(JSON.stringify({
  target: `${target.origin}${target.pathname}`,
  requests: total,
  concurrency,
  errors: failures.length,
  requestsPerSecond: Number((total / elapsedSeconds).toFixed(2)),
  latencyMs: {
    min: Number(durations[0].toFixed(2)),
    p50: Number(percentile(0.5).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    max: Number(durations.at(-1).toFixed(2)),
  },
}, null, 2));

if (failures.length > 0) process.exit(1);
