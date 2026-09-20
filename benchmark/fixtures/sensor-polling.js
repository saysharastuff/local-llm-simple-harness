export function createTemperatureMonitor({
  readTemperature,
  reportTemperature,
  reportError,
  intervalMs = 5000,
}) {
  let timer = null;

  async function poll(signal) {
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
    },
  };
}
