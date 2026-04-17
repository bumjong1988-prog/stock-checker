const cheerio = require('cheerio');
const { fetchHtml } = require('./fetcher');

/**
 * ABC마트 GS(grandstage) 상품 페이지 파싱
 */
async function checkAbc(url) {
  const result = {
    site: 'ABC마트',
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
    
    result.title = $('meta[property="og:title"]').attr('content')
                || $('title').text().trim().slice(0, 200);

    // ABC마트는 보통 사이즈를 button/li로 표시
    const sizeButtons = [];
    $('button, li, span, a').each((i, el) => {
      const cls = $(el).attr('class') || '';
      const text = $(el).text().trim();
      // 사이즈 버튼일 가능성: class에 size 포함 + 짧은 숫자 텍스트
      if (/size/i.test(cls) && text.length > 0 && text.length < 20 && /\d/.test(text)) {
        const isDisabled = $(el).attr('disabled') !== undefined
                        || /sold|out|disabled|nostock|nosell/i.test(cls);
        sizeButtons.push({ text, disabled: isDisabled, cls: cls.slice(0,80) });
      }
    });

    // option select 박스 시도
    const selectOptions = [];
    $('select option').each((i, el) => {
      const text = $(el).text().trim();
      const value = $(el).attr('value');
      if (value && text && /\d/.test(text)) {
        selectOptions.push({ text, value, disabled: $(el).attr('disabled') !== undefined });
      }
    });

    const isSoldOut = html.includes('일시품절') || html.includes('SOLD OUT')
                   || html.includes('재고없음') || html.includes('품절');
    result.available = !isSoldOut;

    result.raw_debug = {
      size_buttons_found: sizeButtons.length,
      size_buttons_sample: sizeButtons.slice(0, 15),
      select_options_count: selectOptions.length,
      select_options_sample: selectOptions.slice(0, 10),
      contains_soldout: isSoldOut,
      html_length: html.length,
    };

    // variations 채우기
    const source = sizeButtons.length ? sizeButtons : selectOptions;
    source.forEach(o => {
      result.variations.push({ label: o.text, available: !o.disabled });
    });

    result.ok = true;
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

module.exports = { checkAbc };
