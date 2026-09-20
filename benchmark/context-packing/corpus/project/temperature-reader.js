export async function readTemperature({ sensor, signal }) {
  // Request cancellation reaches the reader through the AbortSignal.
  return sensor.read({ signal });
}
