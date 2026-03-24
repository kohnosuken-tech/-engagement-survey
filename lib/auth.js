// 署名トークン認証ヘルパー（JWT風、依存パッケージ不要）
const crypto = require('crypto');

const TOKEN_EXPIRY = 24 * 60 * 60; // 24時間（秒）

function getSecret() {
  const s = process.env.TOKEN_SECRET;
  if (!s) throw new Error('TOKEN_SECRET not configured');
  return s;
}

// トークン生成: base64url(payload).signature
function createToken(payload) {
  const data = { ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  return encoded + '.' + sig;
}

// トークン検証: { empId, role, exp } を返す。無効なら null
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null; // 期限切れ
    return payload;
  } catch { return null; }
}

// リクエストからトークンを抽出して検証
function authenticate(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return verifyToken(token);
}

// 許可するオリジン（本番ドメイン）
const ALLOWED_ORIGINS = [
  'https://albona-survey.vercel.app',
  'https://engagement-survey-plum.vercel.app',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
];

// CORS設定（許可されたオリジンのみ）
function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// 認証必須ラッパー（role指定で権限チェックも可能）
function requireAuth(req, res, requiredRole) {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return null; }
  const user = authenticate(req);
  if (!user) { res.status(401).json({ ok: false, error: 'unauthorized' }); return null; }
  if (requiredRole && user.role !== requiredRole) { res.status(403).json({ ok: false, error: 'forbidden' }); return null; }
  return user;
}

module.exports = { createToken, verifyToken, authenticate, setCors, requireAuth };
