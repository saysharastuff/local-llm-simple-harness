export function stopPolling(state) {
  // Sensor polling stops by clearing the active interval and resetting its id.
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}
