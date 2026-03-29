const { queryDB, createPage, updatePage, P } = require('../lib/notion');
const { requireAuth } = require('../lib/auth');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res, 'admin');
  if (!user) return;

  try {
    const body = req.method === 'POST' ? req.body : req.query;
    const { empId, name, dept, role, iq, battlePower, mbti, email, password } = body;
    if (!empId) return res.status(400).json({ ok: false, error: 'empId required' });

    // 既存社員を検索
    const existing = await queryDB('employees', {
      property: 'empId', rich_text: { equals: empId },
    });

    const props = {};
    if (name !== undefined) props.name = P.title(name);
    if (dept !== undefined) props.dept = P.select(dept);
    if (role !== undefined) props.role = P.select(role);
    if (iq !== undefined) props.iq = P.num(Number(iq));
    if (battlePower !== undefined) props.battlePower = P.num(Number(battlePower));
    if (mbti !== undefined) props.mbti = P.rich(mbti);
    if (email !== undefined) props.email = P.rich(email);
    if (password) props.password = P.rich(password);

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
      const hash = crypto.createHash('sha256').update(password).digest('hex');
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
