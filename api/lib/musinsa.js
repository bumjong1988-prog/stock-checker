const cheerio = require('cheerio');
const { fetchHtml } = require('./fetcher');

async function checkMusinsa(url) {
  const result = {
    site: '무신사',
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

    // 사이즈 키워드 주변 컨텍스트
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

    // 품절 키워드 주변
    const soldoutContexts = [];
    ['일시품절', '품절', 'SOLD OUT', '재고없음', 'soldOut', 'outOfStock'].forEach(kw => {
      let pos = 0; let cnt = 0;
      while ((pos = html.indexOf(kw, pos)) !== -1 && cnt < 2) {
        soldoutContexts.push({
          keyword: kw,
          context: html.slice(Math.max(0, pos - 100), pos + 200).replace(/\s+/g, ' '),
        });
        pos += kw.length; cnt++;
      }
    });

    // __NEXT_DATA__ 깊이 탐색
    let nextDataInfo = null;
    const nextScript = $('#__NEXT_DATA__').html();
    if (nextScript) {
      try {
        const nextData = JSON.parse(nextScript);
        const pageProps = nextData?.props?.pageProps || {};
        nextDataInfo = {
          page_props_keys: Object.keys(pageProps),
          dehydrated_state_present: !!pageProps.dehydratedState,
          // 모든 키의 값 미리보기
          samples: {},
        };
        // 각 key의 값을 일부 미리보기
        Object.keys(pageProps).slice(0, 15).forEach(k => {
          const v = pageProps[k];
          nextDataInfo.samples[k] = JSON.stringify(v).slice(0, 200);
        });
      } catch(e) {
        nextDataInfo = { parse_error: e.message };
      }
    }

    // Musinsa API 패턴: goods/{id}/options 같은 거 호출하는지 확인
    const apiPaths = [];
    const apiPattern = /["'](\/api\/[^"']+)["']/g;
    let am; let apiCount = 0;
    while ((am = apiPattern.exec(html)) !== null && apiCount < 10) {
      apiPaths.push(am[1]);
      apiCount++;
    }

    // size, option, variant 같은 키워드 등장 위치
    const optionMentions = [];
    ['"options"', '"optionList"', '"sizeList"', '"sizes"', '"variations"', '"sku"', 'optionInfo'].forEach(kw => {
      let pos = html.indexOf(kw);
      if (pos !== -1) {
        optionMentions.push({
          keyword: kw,
          context: html.slice(Math.max(0, pos - 50), pos + 300).replace(/\s+/g, ' '),
        });
      }
    });

    result.available = !html.includes('일시품절') && !html.includes('SOLD OUT');
    result.raw_debug = {
      html_length: html.length,
      title: result.title,
      next_data_info: nextDataInfo,
      api_paths: [...new Set(apiPaths)].slice(0, 10),
      size_contexts: sizeContexts,
      soldout_contexts: soldoutContexts,
      option_mentions: optionMentions,
    };

    result.ok = true;
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

module.exports = { checkMusinsa };
