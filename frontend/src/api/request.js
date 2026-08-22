/**
 * Resilient API request utility with timeout, signal, and auth helpers.
 */

export function getAuthHeaders(userProp) {
  try {
    const user = userProp || JSON.parse(localStorage.getItem('user') || '{}');
    const token = user?.token || user?.accessToken || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Fetch with automatic request timeout and optional user AbortSignal.
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const { signal: userSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  // If user passes their own abort signal, abort if user aborts
  if (userSignal) {
    if (userSignal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException('Aborted', 'AbortError');
    }
    userSignal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      controller.abort(userSignal.reason);
    });
  }

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError' && !userSignal?.aborted) {
      throw new Error(`Request timed out. Please check your connection.`);
    }
    throw err;
  }
}

/**
 * Standard JSON API request.
 */
export async function apiRequest(url, options = {}) {
  const { timeout = 15000, ...fetchOpts } = options;
  const isFormData = typeof FormData !== 'undefined' && fetchOpts.body instanceof FormData;
  const headers = isFormData
    ? { ...getAuthHeaders(), ...fetchOpts.headers }
    : { 'Content-Type': 'application/json', ...getAuthHeaders(), ...fetchOpts.headers };

  const res = await fetchWithTimeout(url, { ...fetchOpts, headers }, timeout);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}: Request failed`);
  }

  return data;
}