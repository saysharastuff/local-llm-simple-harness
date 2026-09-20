export async function startRelay({ launch, retries = 3 }) {
  // Startup failures after an upgrade are retried here. The retry loop is
  // bounded and reports the final startup error after the final attempt.
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await launch();
    } catch (error) {
      if (attempt === retries) throw error;
    }
  }
}
