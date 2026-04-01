const { queryDB, createPage, updatePage, P } = require('../lib/notion');
const { requireAuth } = require('../lib/auth');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res, 'admin');
  if (!user) return;

  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    const { empId, name, dept, role, iq, battlePower, mbti, email, password } = req.body;
    if (!empId || typeof empId !== 'string') return res.status(400).json({ ok: false, error: 'empId required' });
    if (empId.length > 20) return res.status(400).json({ ok: false, error: 'empId too long' });

    // 入力バリデーション
    if (name !== undefined && typeof name !== 'string') return res.status(400).json({ ok: false, error: 'invalid name' });
    if (name && name.length > 100) return res.status(400).json({ ok: false, error: 'name too long' });
    if (role !== undefined && !['employee', 'admin'].includes(role)) return res.status(400).json({ ok: false, error: 'invalid role' });
    if (email !== undefined && email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'invalid email' });

    // 既存社員を検索
    const existing = await queryDB('employees', {
      property: 'empId', rich_text: { equals: empId },
    });

    const props = {};
    if (name !== undefined) props.name = P.title(name);
    if (dept !== undefined) props.dept = P.select(dept);
    if (role !== undefined) props.role = P.select(role);
    if (iq !== undefined) props.iq = P.num(Number(iq) || 0);
    if (battlePower !== undefined) props.battlePower = P.num(Number(battlePower) || 0);
    if (mbti !== undefined) props.mbti = P.rich(mbti);
    if (email !== undefined) props.email = P.rich(email);
    // パスワードはEmployees DBに平文保存しない（Auth DBにハッシュのみ保存）

    if (existing.length > 0) {
      await updatePage(existing[0].id, props);
    } else {
      props.empId = P.rich(empId);
      props.isActive = P.checkbox(true);
      if (!props.name) props.name = P.title('');
      if (!props.issuedAt) props.issuedAt = P.rich(new Date().toISOString());
      await createPage('employees', props);
    }

    // パスワードが指定されていればAuth DBも更新
    if (password) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = 'scrypt:' + salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
      const authExisting = await queryDB('auth', {
        property: 'empId', rich_text: { equals: empId },
      });

      if (authExisting.length > 0) {
        const authProps = { passwordHash: P.rich(hash) };
        if (role) authProps.role = P.select(role);
        await updatePage(authExisting[0].id, authProps);
      } else {
        await createPage('auth', {
          title: P.title(empId),
          empId: P.rich(empId),
          passwordHash: P.rich(hash),
          role: P.select(role || 'employee'),
        });
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('employee-save error:', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
