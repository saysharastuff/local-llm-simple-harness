// startup retry upgrade startup retry startup telemetry upgrade
export function recordStartupRetry(metrics) {
  metrics.increment("relay.startup.retry");
}
