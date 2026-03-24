const { queryDB, P } = require('../lib/notion');
const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res, 'admin');
  if (!user) return;

  try {
    const results = await queryDB('settings');

    const data = {};
    for (const page of results) {
      const key = P.readTitle(page.properties.key);
      const value = P.readRich(page.properties.value);
      if (key) data[key] = value;
    }

    return res.json({ ok: true, data });
  } catch (e) {
    console.error('settings-load error:', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
