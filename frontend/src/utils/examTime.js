/**
 * Exam timing helpers used by the participant coding exam shell.
 */

/**
 * Calculate remaining milliseconds until the exam ends.
 * @param {string|Date|number} startedAt
 * @param {number|null|undefined} durationMinutes
 * @returns {number}
 */
export function getRemainingMs(startedAt, durationMinutes) {
  if (!startedAt || durationMinutes == null || Number.isNaN(Number(durationMinutes))) {
    return 0;
  }
  const startMs = new Date(startedAt).getTime();
  const endMs = startMs + Number(durationMinutes) * 60 * 1000;
  return Math.max(0, endMs - Date.now());
}

/**
 * Format a millisecond duration as HH:MM:SS.
 * @param {number} ms
 * @returns {string}
 */
export function formatRemainingTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
