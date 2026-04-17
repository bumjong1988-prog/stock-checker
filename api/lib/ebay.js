const cheerio = require('cheerio');
const { fetchHtml } = require('./fetcher');

/**
 * eBay 상품 페이지에서 사이즈/모델별 재고 추출
 * - 멀티 variation 상품: 모델별 사이즈 매트릭스
 * - 단일 상품: 사이즈 1개만
 */
async function checkEbay(url) {
  const result = {
    site: 'eBay',
    url,
    ok: false,
    title: null,
    available: null,        // 전체 판매가능 여부
    variations: [],         // [{ model, size, available }]
    raw_debug: null,
    error: null,
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

    // 1) 페이지 내 임베드된 JSON 검색 (eBay는 modelData를 인라인 JSON으로 넣음)
    let modelData = null;
    $('script').each((i, el) => {
      const txt = $(el).html() || '';
      // variation 데이터가 들어있는 패턴 찾기
      const m = txt.match(/"itemVariationsMap"\s*:\s*(\{.+?\})\s*,\s*"/);
      if (m) {
        try { modelData = JSON.parse(m[1]); } catch(e) {}
      }
    });

    // 2) Select 박스(드롭다운)로 옵션 추출
    const selects = [];
    $('select').each((i, el) => {
      const name = $(el).attr('name') || $(el).attr('id') || '';
      const options = [];
      $(el).find('option').each((j, opt) => {
        const text = $(opt).text().trim();
        const value = $(opt).attr('value');
        const disabled = $(opt).attr('disabled') !== undefined;
        if (text && value && !text.toLowerCase().includes('select')) {
          options.push({ text, value, disabled });
        }
      });
      if (options.length) selects.push({ name, options });
    });

    // 3) 판매 가능 여부 / 재고 수
    const quantityText = $('#qtySubTxt, .qtyTxt, [data-testid="qty-availability"]').text();
    result.available = !html.includes('This listing has ended') 
                    && !html.includes('Sold out')
                    && !html.includes('Item out of stock');

    // 4) 디버그용 - 옵션 정보 그대로 반환
    result.raw_debug = {
      selects_count: selects.length,
      selects,
      quantity_text: quantityText.trim().slice(0, 100),
      has_variation_json: !!modelData,
    };

    // 5) 옵션을 variations 배열로 변환
    // eBay의 일반 패턴: 보통 첫 select가 옵션1(예: 색상/품번), 두 번째가 옵션2(예: 사이즈)
    if (selects.length >= 1) {
      selects[0].options.forEach(opt => {
        result.variations.push({
          option: selects[0].name,
          label: opt.text,
          available: !opt.disabled && !/out of stock|sold out/i.test(opt.text),
        });
      });
    }

    result.ok = true;
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

module.exports = { checkEbay };
