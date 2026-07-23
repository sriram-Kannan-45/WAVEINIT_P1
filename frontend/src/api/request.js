export async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Request failed`);
  }

  return data;
}

export function getAuthHeaders(userProp) {
  const user = userProp || JSON.parse(localStorage.getItem('user') || '{}');
  const token = user?.token || user?.accessToken || '';
  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}