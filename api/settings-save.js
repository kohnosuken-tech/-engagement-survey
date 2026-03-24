const { queryDB, createPage, updatePage, P } = require('../lib/notion');
const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { key, value } = req.method === 'POST' ? req.body : req.query;
    if (!key) return res.status(400).json({ ok: false, error: 'key required' });

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
