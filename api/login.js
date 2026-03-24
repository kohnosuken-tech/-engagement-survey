const { queryDB, P } = require('../lib/notion');
const { createToken, setCors } = require('../lib/auth');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const { empId, password } = req.method === 'POST' ? req.body : req.query;
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

    // パスワード検証
    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    if (storedHash !== inputHash) {
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
