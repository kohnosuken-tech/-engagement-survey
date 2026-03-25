const { queryDB, updatePage, P } = require('../lib/notion');
const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res, 'admin');
  if (!user) return;

  try {
    const { empId } = req.method === 'POST' ? req.body : req.query;
    if (!empId) return res.status(400).json({ ok: false, error: 'empId required' });

    const existing = await queryDB('employees', {
      property: 'empId', rich_text: { equals: empId },
    });

    if (existing.length > 0) {
      await updatePage(existing[0].id, { isActive: P.checkbox(false) });
    }

    // Auth DBのレコードもアーカイブ（ログイン不可にする）
    const authRecords = await queryDB('auth', {
      property: 'empId', rich_text: { equals: empId },
    });
    for (const auth of authRecords) {
      await updatePage(auth.id, {}, true); // archive
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('employee-delete error:', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
