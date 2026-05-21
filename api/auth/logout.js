import { clearAuthCookie } from '../_lib/auth.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Set-Cookie', clearAuthCookie());
  return res.status(200).json({ success: true });
}
