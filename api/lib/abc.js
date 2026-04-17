const cheerio = require('cheerio');
const { fetchHtml } = require('./fetcher');

async function checkAbc(url) {
  const result = {
    site: 'ABC마트',
    url, ok: false, title: null, available: null,
    variations: [], raw_debug: null, error: null,
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

    // 사이즈 컨텍스트
    const sizeContexts = [];
    const sizePattern = /\b(220|225|230|235|240|245|250|255|260|265|270)\b/g;
    let m; let sizeCount = 0;
    while ((m = sizePattern.exec(html)) !== null && sizeCount < 8) {
      const pos = m.index;
      sizeContexts.push({
        size: m[0],
        context: html.slice(Math.max(0, pos - 80), pos + 150).replace(/\s+/g, ' '),
      });
      sizeCount++;
    }

    // 품절 키워드 컨텍스트
    const soldoutContexts = [];
    ['일시품절', '품절', 'SOLD OUT', '재고없음', 'soldOut', '없음'].forEach(kw => {
      let pos = 0; let cnt = 0;
      while ((pos = html.indexOf(kw, pos)) !== -1 && cnt < 2) {
        soldoutContexts.push({
          keyword: kw,
          context: html.slice(Math.max(0, pos - 80), pos + 200).replace(/\s+/g, ' '),
        });
        pos += kw.length; cnt++;
      }
    });

    // size 관련 클래스 가진 요소들
    const sizeElements = [];
    $('[class*="size"], [class*="Size"], [class*="opt"], [class*="Opt"]').each((i, el) => {
      if (i > 30) return false;
      const cls = $(el).attr('class') || '';
      const text = $(el).text().trim().slice(0, 60);
      if (text) sizeElements.push({
        tag: el.tagName,
        cls: cls.slice(0, 80),
        text,
      });
    });

    // script 안에 사이즈/옵션 데이터
    const dataScripts = [];
    $('script').each((i, el) => {
      const txt = $(el).html() || '';
      if (txt.length > 100 && (txt.includes('itemSize') || txt.includes('optnNm') 
          || txt.includes('sizeNm') || txt.includes('재고') || txt.includes('220'))) {
        dataScripts.push({
          length: txt.length,
          preview: txt.slice(0, 500).replace(/\s+/g, ' '),
        });
      }
    });

    // API 패턴
    const apiPaths = [];
    const apiPattern = /["'](\/[a-z-]+\/[a-z-/]+\.json[^"']*)["']/gi;
    let am; let apiCount = 0;
    while ((am = apiPattern.exec(html)) !== null && apiCount < 10) {
      apiPaths.push(am[1]);
      apiCount++;
    }

    result.available = !html.includes('일시품절') && !html.includes('SOLD OUT');
    result.raw_debug = {
      html_length: html.length,
      title: result.title,
      size_elements_count: sizeElements.length,
      size_elements_sample: sizeElements.slice(0, 15),
      size_contexts: sizeContexts,
      soldout_contexts: soldoutContexts.slice(0, 5),
      data_scripts: dataScripts.slice(0, 3),
      api_paths: [...new Set(apiPaths)].slice(0, 10),
    };

    result.ok = true;
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

module.exports = { checkAbc };
