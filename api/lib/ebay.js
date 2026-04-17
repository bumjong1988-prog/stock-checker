const cheerio = require('cheerio');
const { fetchHtml } = require('./fetcher');

async function checkEbay(url) {
  const result = {
    site: 'eBay',
    url, ok: false, title: null, available: null,
    variations: [], raw_debug: null, error: null,
  };

  try {
    const { status, html } = await fetchHtml(url);
    if (status !== 200) {
      result.error = `HTTP ${status}`;
      return result;
    }

    const $ = cheerio.load(html);
    result.title = $('h1.x-item-title__mainTitle span').first().text().trim()
                || $('h1').first().text().trim().slice(0, 200);

    // data-sku-value-name 속성으로 사이즈/옵션 추출
    const skuOptions = [];
    $('[data-sku-value-name]').each((i, el) => {
      const name = $(el).attr('data-sku-value-name') || '';
      const cls = $(el).attr('class') || '';
      const ariaDisabled = $(el).attr('aria-disabled') === 'true';
      const parentCls = $(el).parent().attr('class') || '';
      const grandCls = $(el).parent().parent().attr('class') || '';
      const disabled = ariaDisabled
                    || /disabled|out-of-stock|unavailable|sold-out/i.test(cls)
                    || /disabled|out-of-stock|sold-out/i.test(parentCls)
                    || /disabled|out-of-stock|sold-out/i.test(grandCls);
      if (name) skuOptions.push({ name, disabled });
    });

    // 중복 제거
    const seen = new Set();
    const dedupedSkus = [];
    skuOptions.forEach(s => {
      const key = s.name + '|' + s.disabled;
      if (!seen.has(s.name)) {
        seen.add(s.name);
        dedupedSkus.push(s);
      }
    });

    dedupedSkus.forEach(s => {
      // 사이즈 숫자만 추출 (예: "(KOR) 220 / US(W) 5" → 220)
      const sizeMatch = s.name.match(/\b(\d{3})\b/);
      result.variations.push({
        label: s.name,
        size: sizeMatch ? sizeMatch[1] : null,
        available: !s.disabled,
      });
    });

    // 품번 추출
    const metaDesc = $('meta[property="og:description"]').attr('content')
                  || $('meta[name="description"]').attr('content') || '';
    const modelPattern = /\b([A-Z]{2,3}\d{4,6})\b/g;
    const models = [...new Set(metaDesc.match(modelPattern) || [])];

    result.available = !html.includes('This listing has ended')
                    && !html.includes('Sold out')
                    && result.variations.some(v => v.available);

    result.raw_debug = {
      sku_options_count: dedupedSkus.length,
      models_found: models,
    };

    result.ok = true;
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

module.exports = { checkEbay };
