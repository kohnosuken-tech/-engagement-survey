const { queryDB, P } = require('../lib/notion');
const { createToken, setCors } = require('../lib/auth');
const crypto = require('crypto');

// 簡易Rate Limiting（メモリベース、Vercel Serverless向け）
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1分
const RATE_LIMIT_MAX = 5; // 1分あたり5回まで

function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || [];
  const recent = attempts.filter(t => now - t < RATE_LIMIT_WINDOW);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  loginAttempts.set(ip, recent);
  return true;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: 'too_many_requests' });
  }

  try {
    const { empId, password } = req.body;
    if (!empId || !password) return res.status(400).json({ ok: false, error: 'empId and password required' });

    // Auth DBから該当社員を検索
    const authResults = await queryDB('auth', {
      property: 'empId', rich_text: { equals: empId },
    });

    // ユーザー列挙防止: not_found も invalid_password も同じエラー
    if (authResults.length === 0) {
      return res.json({ ok: false, error: 'invalid_credentials' });
    }

    const authPage = authResults[0];
    const storedHash = P.readRich(authPage.properties.passwordHash);
    const role = P.readSelect(authPage.properties.role) || 'employee';

    // パスワード検証（scrypt形式 or レガシーsha256形式に対応）
    let passwordValid = false;
    if (storedHash.startsWith('scrypt:')) {
      const [, salt, hash] = storedHash.split(':');
      const inputHash = crypto.scryptSync(password, salt, 64).toString('hex');
      passwordValid = crypto.timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(hash, 'hex'));
    } else {
      const inputHash = crypto.createHash('sha256').update(password).digest('hex');
      passwordValid = storedHash.length === inputHash.length &&
        crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(inputHash));
    }
    if (!passwordValid) {
      return res.json({ ok: false, error: 'invalid_credentials' });
    }

    // 社員情報取得
    const empResults = await queryDB('employees', {
      property: 'empId', rich_text: { equals: empId },
    });
    const emp = empResults[0];
    const name = emp ? P.readTitle(emp.properties.name) : '';
    const dept = emp ? P.readSelect(emp.properties.dept) : '';

    // 署名トークン生成
    const token = createToken({ empId, role });

    return res.json({ ok: true, token, role, empId, name, dept });
  } catch (e) {
    console.error('login error:', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
