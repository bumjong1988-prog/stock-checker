const cheerio = require('cheerio');
const fetch = require('node-fetch');
const { fetchHtml } = require('./fetcher');

const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://www.musinsa.com/',
  'Origin': 'https://www.musinsa.com',
};

async function tryFetch(url) {
  try {
    const res = await fetch(url, { headers: API_HEADERS, timeout: 10000 });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch(e) {}
    return { status: res.status, json, text_preview: text.slice(0, 500) };
  } catch (e) {
    return { error: e.message };
  }
}

async function checkMusinsa(url) {
  const result = {
    site: '무신사',
    url, ok: false, title: null, available: null,
    variations: [], raw_debug: null, error: null,
  };

  try {
    // 1) URL에서 goodsNo 추출
    const m = url.match(/products\/(\d+)/);
    if (!m) {
      result.error = 'goodsNo not found in URL';
      return result;
    }
    const goodsNo = m[1];

    // 2) 시도할 API 후보들
    const apiCandidates = [
      `https://goods.musinsa.com/api2/goods/${goodsNo}/options`,
      `https://goods.musinsa.com/api2/product/${goodsNo}`,
      `https://goods.musinsa.com/api/v1/goods/${goodsNo}`,
      `https://goods-detail.musinsa.com/api2/goods-detail/v1/contents/${goodsNo}`,
      `https://goods.musinsa.com/api/goods/${goodsNo}`,
      `https://api.musinsa.com/api2/goods/${goodsNo}/options`,
      `https://www.musinsa.com/products/${goodsNo}/options`,
    ];

    const apiResults = {};
    let foundData = null;

    for (const apiUrl of apiCandidates) {
      const r = await tryFetch(apiUrl);
      apiResults[apiUrl] = {
        status: r.status,
        is_json: !!r.json,
        preview: r.text_preview ? r.text_preview.slice(0, 200) : null,
        error: r.error,
      };
      if (r.json && r.status === 200) {
        // 옵션/사이즈 정보가 들어있는지 확인
        const str = JSON.stringify(r.json);
        if (str.includes('option') || str.includes('size') || str.includes('220')) {
          foundData = { url: apiUrl, data: r.json };
          break;
        }
      }
    }

    // 3) HTML에서 title 가져오기 (백업)
    const { html } = await fetchHtml(url);
    const $ = cheerio.load(html);
    result.title = $('meta[property="og:title"]').attr('content')
                || $('title').text().trim().slice(0, 200);

    // 4) 찾은 데이터에서 사이즈 추출
    if (foundData) {
      const data = foundData.data;
      // 가능한 옵션 경로들
      const optionLists = [
        data?.data?.optionItems,
        data?.data?.options,
        data?.data?.goodsOption,
        data?.data?.sizeOptionList,
        data?.optionItems,
        data?.options,
        data?.data?.option?.items,
        data?.data?.optionList,
      ].filter(Boolean);

      const optList = optionLists[0];
      if (Array.isArray(optList)) {
        optList.forEach(opt => {
          const label = opt.optionName || opt.name || opt.optionValue || opt.size || JSON.stringify(opt).slice(0,50);
          const isOut = opt.outOfStock === true || opt.soldOut === true 
                     || opt.stockStatus === 'SOLD_OUT' || opt.remainQty === 0
                     || opt.stockQty === 0;
          result.variations.push({
            label: String(label),
            available: !isOut,
          });
        });
      }
    }

    result.available = result.variations.some(v => v.available);
    result.raw_debug = {
      goods_no: goodsNo,
      api_candidates_tried: apiCandidates.length,
      api_results_summary: apiResults,
      found_api: foundData ? foundData.url : null,
      found_data_keys: foundData ? Object.keys(foundData.data).slice(0,10) : null,
      found_data_preview: foundData ? JSON.stringify(foundData.data).slice(0, 800) : null,
    };

    result.ok = true;
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

module.exports = { checkMusinsa };
