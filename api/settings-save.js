const { queryDB, createPage, updatePage, P } = require('../lib/notion');
const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ ok: false, error: 'key required' });

    // 一般社員は自分のBizIQ/プロフィールのみ書込可。システム設定はadmin限定
    const isPersonalKey = key.startsWith('es_biziq_') || key.startsWith('es_profile_');
    if (!isPersonalKey && user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    // 一般社員は自分のデータのみ書き込み可
    if (isPersonalKey && user.role !== 'admin' && !key.includes(user.empId)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const existing = await queryDB('settings', {
      property: 'key', title: { equals: key },
    });

    if (existing.length > 0) {
      if (value === '' || value === null || value === undefined) {
        await updatePage(existing[0].id, {}, true);
      } else {
        await updatePage(existing[0].id, { value: P.rich(value) });
      }
    } else if (value && value !== '') {
      await createPage('settings', {
        key: P.title(key),
        value: P.rich(value),
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('settings-save error:', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
