export const MENTOR_TIMEOUT_MS = 20000
export const authHeaders = token => ({'Content-Type': 'application/json', Authorization: `Bearer ${token}`})
export async function readMentorResponse(res) {
  let data
  try { data = await res.json() } catch { throw new Error('The mentor returned an invalid response. Please retry.') }
  if (!res.ok || data?.success === false) {
    const error = new Error(typeof data?.error === 'string' ? data.error : 'The mentor is temporarily unavailable. Please retry.')
    error.status = res.status
    error.code = data?.code
    error.remaining = data?.remaining
    throw error
  }
  if (typeof data?.response !== 'string' || !data.response.trim()) throw new Error('The mentor returned an empty reply. Please retry.')
  return data
}
