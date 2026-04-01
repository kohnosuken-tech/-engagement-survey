const { setCors } = require('../lib/auth');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  // セッションはクライアント側で管理しているためサーバー側は常にOK
  return res.json({ ok: true });
};
