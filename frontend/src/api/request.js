export async function apiRequest(url, options = {}) {
  try {
    console.log('🌐 CALLING:', url, options.method || 'GET');

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

    console.log('✅ SUCCESS:', res.status, url);
    return data;
  } catch (err) {
    console.error('❌ API ERROR:', err.message, url);
    throw err;
  }
}

export function getAuthHeaders(userProp) {
  const user = userProp || JSON.parse(localStorage.getItem('user') || '{}');
  const token = user?.token || user?.accessToken || '';
  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}