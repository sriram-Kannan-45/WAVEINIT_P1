/**
 * Privacy Data Masking Utilities
 * Redacts personal identifiable information (PII) before writing to server logs.
 */

function maskEmail(email) {
  if (!email || typeof email !== 'string') return '***';
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0) return '***';
  const name = trimmed.substring(0, atIdx);
  const domain = trimmed.substring(atIdx + 1);
  const maskedName = name.length > 2
    ? `${name[0]}***${name[name.length - 1]}`
    : `${name[0]}***`;
  return `${maskedName}@${domain}`;
}

function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '***';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***-***-${digits.slice(-4)}`;
}

function maskToken(token) {
  if (!token || typeof token !== 'string') return '***';
  if (token.length <= 8) return '***';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function maskCredential(cred) {
  if (!cred || typeof cred !== 'string') return '***';
  if (cred.includes('@')) return maskEmail(cred);
  return cred.length > 2 ? `${cred[0]}***${cred[cred.length - 1]}` : '***';
}

module.exports = {
  maskEmail,
  maskPhone,
  maskToken,
  maskCredential,
};
