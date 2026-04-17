const cheerio = require('cheerio');
const fetch = require('node-fetch');
const { fetchHtml } = require('./fetcher');

const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://grandstage.a-rt.com/',
  'X-Requested-With': 'XMLHttpRequest',
};

async function tryFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { 
      headers: { ...API_HEADERS, ...(opts.headers || {}) }, 
      method: opts.method || 'GET',
      body: opts.body,
      timeout: 10000,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch(e) {}
    return { status: res.status, json, text_preview: text.slice(0, 500) };
  } catch (e) {
    return { error: e.message };
  }
}

async function checkAbc(url) {
  const result = {
    site: 'ABC마트',
    url, ok: false, title: null, available: null,
    variations: [], raw_debug: null, error: null,
  };

  try {
    // 1) prdtNo 추출
    const m = url.match(/prdtNo=(\d+)/);
    if (!m) {
      result.error = 'prdtNo not found in URL';
      return result;
    }
    const prdtNo = m[1];

    // 2) ABC마트 옵션 API 후보들
    const apiCandidates = [
      { url: `https://grandstage.a-rt.com/product/option/list?prdtNo=${prdtNo}`, method: 'GET' },
      { url: `https://grandstage.a-rt.com/product/optionList?prdtNo=${prdtNo}`, method: 'GET' },
      { url: `https://grandstage.a-rt.com/api/product/option/${prdtNo}`, method: 'GET' },
      { url: `https://grandstage.a-rt.com/product/getOptionInfo?prdtNo=${prdtNo}`, method: 'GET' },
      { url: `https://grandstage.a-rt.com/product/optnInfo?prdtNo=${prdtNo}`, method: 'GET' },
      { url: `https://grandstage.a-rt.com/product/optnList.json?prdtNo=${prdtNo}`, method: 'GET' },
    ];

    const apiResults = {};
    let foundData = null;

    for (const c of apiCandidates) {
      const r = await tryFetch(c.url, { method: c.method });
      apiResults[c.url] = {
        status: r.status,
        is_json: !!r.json,
        preview: r.text_preview ? r.text_preview.slice(0, 200) : null,
        error: r.error,
      };
      if (r.json && r.status === 200) {
        const str = JSON.stringify(r.json);
        if (str.includes('option') || str.includes('size') || str.includes('Size')
            || str.includes('220') || str.includes('재고') || str.includes('opt')) {
          foundData = { url: c.url, data: r.json };
          break;
        }
      }
    }

    // 3) HTML 페이지에서 title + 인라인 데이터 가져오기
    const { html } = await fetchHtml(url);
    const $ = cheerio.load(html);
    result.title = $('meta[property="og:title"]').attr('content')
                || $('title').text().trim().slice(0, 200);

    // 4) HTML 안에 옵션 데이터가 인라인으로 들어있는지 확인 (script 태그 안)
    let inlineOptions = null;
    $('script').each((i, el) => {
      const txt = $(el).html() || '';
      // var optionList = [...] 같은 패턴
      const patterns = [
        /var\s+optionList\s*=\s*(\[.+?\]);/s,
        /optionInfo\s*=\s*(\{.+?\});/s,
        /"optionList"\s*:\s*(\[.+?\])/s,
        /"itemSizes"\s*:\s*(\[.+?\])/s,
      ];
      for (const p of patterns) {
        const m = txt.match(p);
        if (m && !inlineOptions) {
          try { inlineOptions = JSON.parse(m[1]); } catch(e) {}
        }
      }
    });

    // 5) 찾은 데이터에서 사이즈 추출
    const dataSrc = foundData?.data || inlineOptions;
    if (dataSrc) {
      const optionLists = [
        dataSrc?.data,
        dataSrc?.data?.optionList,
        dataSrc?.data?.itemList,
        dataSrc?.optionList,
        dataSrc?.itemList,
        Array.isArray(dataSrc) ? dataSrc : null,
      ].filter(Boolean);

      const optList = optionLists.find(x => Array.isArray(x));
      if (optList) {
        optList.forEach(opt => {
          const label = opt.optnNm || opt.itemSize || opt.sizeNm || opt.size 
                      || opt.name || opt.optionName || JSON.stringify(opt).slice(0,50);
          const isOut = opt.soldOutYn === 'Y' || opt.stockQty === 0
                     || opt.stockYn === 'N' || opt.saleYn === 'N'
                     || opt.outOfStock === true;
          result.variations.push({
            label: String(label),
            available: !isOut,
          });
        });
      }
    }

    result.available = result.variations.some(v => v.available);
    result.raw_debug = {
      prdt_no: prdtNo,
      api_results_summary: apiResults,
      found_api: foundData?.url || null,
      found_data_preview: dataSrc ? JSON.stringify(dataSrc).slice(0, 800) : null,
      has_inline_options: !!inlineOptions,
    };

    result.ok = true;
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

module.exports = { checkAbc };
