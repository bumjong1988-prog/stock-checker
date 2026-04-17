const { checkEbay } = require('./lib/ebay');
const { checkMusinsa } = require('./lib/musinsa');
const { checkAbc } = require('./lib/abc');

/**
 * POST /api/check
 * Body: { urls: { ebay?: string, musinsa?: string, abc?: string } }
 * 또는 GET /api/check?ebay=...&musinsa=...&abc=...
 */
module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // URL 추출 (GET/POST 둘 다 지원)
  let urls = {};
  if (req.method === 'POST') {
    urls = (req.body && req.body.urls) || {};
  } else {
    urls = {
      ebay: req.query.ebay || null,
      musinsa: req.query.musinsa || null,
      abc: req.query.abc || null,
    };
  }

  const tasks = [];
  if (urls.ebay) tasks.push(checkEbay(urls.ebay));
  if (urls.musinsa) tasks.push(checkMusinsa(urls.musinsa));
  if (urls.abc) tasks.push(checkAbc(urls.abc));

  if (!tasks.length) {
    res.status(400).json({ error: 'No URLs provided. Send {urls: {ebay, musinsa, abc}}' });
    return;
  }

  const startedAt = Date.now();
  const results = await Promise.allSettled(tasks);
  const data = results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message });

  // 교차 비교 분석
  const compare = analyzeAlerts(data);

  res.status(200).json({
    elapsed_ms: Date.now() - startedAt,
    checked_at: new Date().toISOString(),
    results: data,
    alerts: compare,
  });
};

/**
 * 결과 교차 비교: 소싱처는 품절인데 eBay는 판매중인 사이즈 찾기
 */
function analyzeAlerts(results) {
  const ebay = results.find(r => r.site === 'eBay');
  const sources = results.filter(r => r.site === '무신사' || r.site === 'ABC마트');
  
  const alerts = [];
  if (!ebay || !ebay.ok) return alerts;
  
  // eBay에서 available한 사이즈 모음
  const ebayAvailable = new Set();
  (ebay.variations || []).forEach(v => {
    if (v.available) {
      // 사이즈 숫자만 추출 (예: "240" "240mm" "245 - $129.99")
      const m = (v.label || '').match(/\d{3}/);
      if (m) ebayAvailable.add(m[0]);
    }
  });
  
  // 각 소싱처에서 품절인 사이즈가 eBay에서 살아있으면 알림
  sources.forEach(src => {
    if (!src.ok) return;
    (src.variations || []).forEach(v => {
      if (!v.available) {
        const m = (v.label || '').match(/\d{3}/);
        if (m && ebayAvailable.has(m[0])) {
          alerts.push({
            level: 'warning',
            message: `${src.site}에서 ${m[0]} 품절인데 eBay 활성 — 리스팅 점검 필요`,
            size: m[0],
            source: src.site,
          });
        }
      }
    });
  });
  
  return alerts;
}
