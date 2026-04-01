const { queryDB, createPage, P } = require('../lib/notion');
const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    const { month, answers } = req.body;
    const empId = user.empId; // トークンから取得（なりすまし防止）
    if (!empId || !month) return res.status(400).json({ ok: false, error: 'empId and month required' });
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ ok: false, error: 'invalid month format' });

    // 重複チェック
    const existing = await queryDB('surveys', {
      and: [
        { property: 'empId', rich_text: { equals: empId } },
        { property: 'month', rich_text: { equals: month } },
      ],
    });
    if (existing.length > 0) return res.json({ ok: false, error: 'already_submitted' });

    // 回答保存（サイズ制限: 10KB）
    const answersStr = typeof answers === 'string' ? answers : JSON.stringify(answers);
    if (answersStr.length > 10000) return res.status(400).json({ ok: false, error: 'answers too large' });
    await createPage('surveys', {
      empId: P.rich(empId),
      month: P.rich(month),
      answers: P.rich(answersStr),
      submittedAt: { date: { start: new Date().toISOString() } },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('submit error:', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
