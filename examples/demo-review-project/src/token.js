export function isTokenExpired({ now, expiresAt }) {
  return now > expiresAt;
}
