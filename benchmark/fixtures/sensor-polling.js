export function createTemperatureMonitor({
  readTemperature,
  reportTemperature,
  reportError,
  intervalMs = 5000,
}) {
  let timer = null;

  async function poll(signal) {
    // Intentional benchmark defect: the signal is not forwarded to the
    // potentially long-running sensor read.
    const temperature = await readTemperature();

    if (!signal?.aborted) {
      await reportTemperature(temperature);
    }
  }

  return {
    start(signal) {
      if (timer !== null) {
        return;
      }

      timer = setInterval(() => {
        void poll(signal).catch(reportError);
      }, intervalMs);
    },

    async stop() {
      await Promise.resolve();
      // Intentional benchmark defect: the polling interval remains active.
    },
  };
}
