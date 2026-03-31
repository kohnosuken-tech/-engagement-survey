const { queryDB, P } = require('../lib/notion');
const { setCors } = require('../lib/auth');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // GASからの呼び出し用: シークレットキーで認証
  const secret = req.headers['x-mail-secret'] || '';
  const envSecret = (process.env.MAIL_API_SECRET || '').trim();
  if (!envSecret || secret !== envSecret) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  try {
    const results = await queryDB('employees', {
      property: 'isActive', checkbox: { equals: true },
    });

    const data = results
      .map(page => {
        const p = page.properties;
        return {
          empId: P.readRich(p.empId),
          name: P.readTitle(p.name),
          dept: P.readSelect(p.dept),
          email: P.readRich(p.email),
        };
      })
      .filter(e => e.email); // メアド登録済みのみ

    return res.json({ ok: true, data });
  } catch (e) {
    console.error('mail-employees error:', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
