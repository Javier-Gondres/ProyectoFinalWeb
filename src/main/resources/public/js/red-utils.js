/**
 * Indica si conviene guardar en cola local
 * @param {unknown} err
 */
export function esFalloDeRed(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  const msg = String(/** @type {Error} */ (err)?.message || err || "");
  if (/failed to fetch|network|load failed|networkerror|aborted/i.test(msg)) return true;
  if (/** @type {Error} */ (err)?.name === "AbortError") return true;
  if (/HTTP\s+(0|502|503|504)\b/.test(msg)) return true;
  const st = /** @type {{ status?: number }} */ (err)?.status;
  if (st === 502 || st === 503 || st === 504 || st === 0) return true;
  return false;
}
