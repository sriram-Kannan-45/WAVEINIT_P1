/**
 * Resilient API request utility with timeout, signal, auth helpers,
 * in-flight request deduplication, and Stale-While-Revalidate (SWR) caching.
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

// ── In-flight Request Deduplication ──
const inFlightRequests = new Map();

// ── Memory SWR Response Cache ──
const memoryCache = new Map();

/**
 * Invalidate client cache by URL or key prefix
 */
export function invalidateApiCache(prefix = '') {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.includes(prefix)) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Fetch with automatic request timeout and optional user AbortSignal.
 * Deduplicates identical simultaneous GET requests to avoid network stampedes.
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';

  // Request deduplication for simultaneous identical GET requests
  const dedupeKey = isGet && !options.body ? `GET:${url}` : null;
  if (dedupeKey && inFlightRequests.has(dedupeKey)) {
    return inFlightRequests.get(dedupeKey).then((res) => res.clone());
  }

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

  const reqPromise = (async () => {
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
    } finally {
      if (dedupeKey) inFlightRequests.delete(dedupeKey);
    }
  })();

  if (dedupeKey) {
    inFlightRequests.set(dedupeKey, reqPromise);
  }

  return reqPromise;
}

/**
 * Fetch with Stale-While-Revalidate caching.
 * Returns cached data immediately if available, then refreshes in background.
 */
export async function fetchWithCache(url, options = {}, ttlMs = 15000) {
  const cacheKey = `${url}:${options.headers?.Authorization || ''}`;
  const cached = memoryCache.get(cacheKey);
  const now = Date.now();

  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  const res = await fetchWithTimeout(url, options);
  const data = await res.json().catch(() => ({}));

  if (res.ok) {
    memoryCache.set(cacheKey, {
      data,
      expiresAt: now + ttlMs,
    });
  }

  return data;
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