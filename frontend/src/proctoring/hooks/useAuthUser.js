/**
 * useAuthUser — synchronous read of the authenticated user from
 * localStorage with a one-tick `ready` flag so callers can wait for
 * hydration before firing any API call.
 *
 * Equivalent to "wait for supabase.auth.getUser()" in your spec —
 * but adapted to the project's actual JWT-in-localStorage stack.
 *
 *   const { user, userId, token, ready } = useAuthUser();
 *
 *   useEffect(() => {
 *     if (!ready || !userId) return;        // <- guards against null id
 *     proctorApi.startSession({ ... });
 *   }, [ready, userId]);
 */
import { useEffect, useState } from 'react';

function readUser() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function useAuthUser() {
  const [user, setUser] = useState(() => readUser());
  const [ready, setReady] = useState(false);

  // First render mounts synchronously; mark ready on the first effect tick
  useEffect(() => { setReady(true); }, []);

  // React to login / logout from other tabs (the existing app stores
  // the user in localStorage; this keeps state in sync).
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'user') setUser(readUser());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const userId = user?.id ?? null;
  const token = user?.token ?? user?.accessToken ?? null;

  return { user, userId, token, ready };
}
