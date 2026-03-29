const { queryDB, P } = require('../lib/notion');
const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res, 'admin');
  if (!user) return;

  try {
    const results = await queryDB('employees', {
      property: 'isActive', checkbox: { equals: true },
    });

    const data = results.map(page => {
      const p = page.properties;
      return {
        empId: P.readRich(p.empId),
        name: P.readTitle(p.name),
        dept: P.readSelect(p.dept),
        role: P.readSelect(p.role) || 'employee',
        iq: P.readNum(p.iq),
        battlePower: P.readNum(p.battlePower),
        mbti: P.readRich(p.mbti),
        email: P.readRich(p.email),
        password: P.readRich(p.password),
        isActive: P.readCheckbox(p.isActive),
        issuedAt: P.readRich(p.issuedAt),
      };
    });

    return res.json({ ok: true, data });
  } catch (e) {
    console.error('employees error:', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
