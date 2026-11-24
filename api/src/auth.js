import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) throw new Error('JWT_SECRET missing or too short');

const COOKIE = 'ca_token';
const WEEK = 7 * 24 * 3600;
const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

export function setSession(res, userId) {
  const token = jwt.sign({ sub: String(userId) }, SECRET, { algorithm: 'HS256', expiresIn: WEEK });
  res.cookie(COOKIE, token, { ...cookieOpts, maxAge: WEEK * 1000 });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, cookieOpts);
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'login required' });
  try {
    const p = jwt.verify(token, SECRET, { algorithms: ['HS256'] }); // pin the algorithm
    req.userId = p.sub;
    next();
  } catch {
    res.status(401).json({ error: 'login required' });
  }
}