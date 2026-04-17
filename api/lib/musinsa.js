const cheerio = require('cheerio');
const { fetchHtml } = require('./fetcher');

/**
 * 무신사 상품 페이지 파싱
 * - SPA지만 Next.js 기반이라 __NEXT_DATA__ 인라인 JSON에 사이즈/재고 정보가 있을 가능성 높음
 * - 또는 별도 옵션 API를 호출해야 할 수도 있음
 */
async function checkMusinsa(url) {
  const result = {
    site: '무신사',
    url,
    ok: false,
    title: null,
    available: null,
    variations: [],
    raw_debug: null,
    error: null,
  };

  try {
    const { status, html } = await fetchHtml(url);
    if (status !== 200) {
      result.error = `HTTP ${status}`;
      result.raw_debug = { html_preview: html.slice(0, 300) };
      return result;
    }

    const $ = cheerio.load(html);
    
    // Title (og:title이 가장 안정적)
    result.title = $('meta[property="og:title"]').attr('content')
                || $('title').text().trim().slice(0, 200);

    // 1) __NEXT_DATA__ 시도 (Next.js 기본 패턴)
    let nextData = null;
    const nextScript = $('#__NEXT_DATA__').html();
    if (nextScript) {
      try { nextData = JSON.parse(nextScript); } catch(e) {}
    }

    // 2) 다른 인라인 JSON 패턴들 시도
    let optionInfo = null;
    $('script').each((i, el) => {
      const txt = $(el).html() || '';
      // sizeOptions, optionList 같은 패턴
      const m = txt.match(/"optionList"\s*:\s*(\[.+?\])/);
      if (m && !optionInfo) {
        try { optionInfo = JSON.parse(m[1]); } catch(e) {}
      }
    });

    // 3) 사이즈 정보가 들어있을만한 element들 검색
    const sizeButtons = [];
    $('[class*="size"], [class*="Size"], [data-size]').each((i, el) => {
      const text = $(el).text().trim();
      const dataSize = $(el).attr('data-size');
      const cls = $(el).attr('class') || '';
      const isDisabled = $(el).attr('disabled') !== undefined 
                      || /sold|out|disabled/i.test(cls);
      if (text && text.length < 30) {
        sizeButtons.push({ text, dataSize, disabled: isDisabled, cls: cls.slice(0,80) });
      }
    });

    // 4) 품절/재고 키워드 검색
    const isSoldOut = html.includes('일시품절') || html.includes('SOLD OUT') 
                   || html.includes('재고 없음') || html.includes('품절');
    result.available = !isSoldOut;

    result.raw_debug = {
      has_next_data: !!nextData,
      next_data_keys: nextData ? Object.keys(nextData.props?.pageProps || {}).slice(0, 10) : null,
      has_option_list: !!optionInfo,
      option_list_count: optionInfo?.length || 0,
      size_buttons_found: sizeButtons.length,
      size_buttons_sample: sizeButtons.slice(0, 15),
      contains_soldout_keyword: isSoldOut,
      html_length: html.length,
    };

    // 5) 가능하면 실제 사이즈 추출
    if (optionInfo && Array.isArray(optionInfo)) {
      optionInfo.forEach(opt => {
        result.variations.push({
          label: opt.optionName || opt.name || JSON.stringify(opt).slice(0,50),
          available: opt.outOfStock !== true && opt.soldOut !== true,
        });
      });
    } else if (sizeButtons.length) {
      sizeButtons.forEach(b => {
        result.variations.push({ label: b.text, available: !b.disabled });
      });
    }

    result.ok = true;
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

module.exports = { checkMusinsa };
