import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'a3dia_token';
const isProd = process.env.VERCEL_ENV === 'production';

export function parseCookies(header = '') {
  const cookies = {};
  for (const pair of header.split(';')) {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k.trim()] = decodeURIComponent(v.join('='));
  }
  return cookies;
}

export function verifyToken(cookieHeader) {
  try {
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export function requireAuth(req, res) {
  const payload = verifyToken(req.headers.cookie);
  if (!payload) {
    res.status(401).json({ success: false, error: 'Non authentifié' });
    return null;
  }
  return payload;
}

export function requireAdmin(req, res) {
  const payload = requireAuth(req, res);
  if (!payload) return null;
  if (payload.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Accès refusé — rôle administrateur requis' });
    return null;
  }
  return payload;
}

export function makeAuthCookie(token) {
  const flags = `HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}${isProd ? '; Secure' : ''}`;
  return `${COOKIE_NAME}=${token}; ${flags}`;
}

export function clearAuthCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
