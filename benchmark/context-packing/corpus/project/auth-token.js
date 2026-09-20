export function loadAuthToken(env) {
  // The API auth token is loaded from HARNESS_MODEL_API_KEY.
  return env.HARNESS_MODEL_API_KEY ?? "";
}
