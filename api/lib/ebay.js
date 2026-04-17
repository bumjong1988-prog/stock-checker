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
      result.raw_debug = { html_preview: html.slice(0, 300) };
      return result;
    }

    const $ = cheerio.load(html);
    result.title = $('h1.x-item-title__mainTitle span').first().text().trim()
                || $('h1').first().text().trim().slice(0, 200);

    const selects = [];
    $('select').each((i, el) => {
      const options = [];
      $(el).find('option').each((j, opt) => {
        options.push({
          text: $(opt).text().trim(),
          value: $(opt).attr('value'),
          disabled: $(opt).attr('disabled') !== undefined,
        });
      });
      selects.push({
        name: $(el).attr('name') || '',
        id: $(el).attr('id') || '',
        options: options.slice(0, 20),
      });
    });

    const ulOptions = [];
    $('[class*="msku"], [class*="x-msku"], [data-componentid*="msku"], [class*="select-box"]').each((i, el) => {
      const cls = $(el).attr('class') || '';
      const text = $(el).text().trim();
      if (text && text.length < 200) ulOptions.push({ tag: el.tagName, cls: cls.slice(0, 100), text: text.slice(0, 100) });
    });

    const modelContexts = [];
    ['KJ3969', 'KJ3970', 'HP7130'].forEach(model => {
      let pos = 0; let count = 0;
      while ((pos = html.indexOf(model, pos)) !== -1 && count < 3) {
        modelContexts.push({
          model,
          context: html.slice(Math.max(0, pos - 100), pos + 200).replace(/\s+/g, ' '),
        });
        pos += model.length;
        count++;
      }
    });

    const sizeContexts = [];
    const sizePattern = /\b(220|225|230|235|240|245|250|255|260)\b/g;
    let m; let sizeCount = 0;
    while ((m = sizePattern.exec(html)) !== null && sizeCount < 5) {
      const pos = m.index;
      sizeContexts.push({
        size: m[0],
        context: html.slice(Math.max(0, pos - 80), pos + 150).replace(/\s+/g, ' '),
      });
      sizeCount++;
    }

    const jsonScripts = [];
    $('script').each((i, el) => {
      const txt = $(el).html() || '';
      if (txt.length > 100 && (txt.includes('variation') || txt.includes('msku') || txt.includes('KJ3'))) {
        jsonScripts.push({
          length: txt.length,
          has_variation: txt.includes('variation'),
          has_msku: txt.includes('msku'),
          preview: txt.slice(0, 400).replace(/\s+/g, ' '),
        });
      }
    });

    result.available = !html.includes('This listing has ended') && !html.includes('Sold out');
    result.raw_debug = {
      html_length: html.length,
      selects_count: selects.length,
      selects,
      ul_options_sample: ulOptions.slice(0, 10),
      model_contexts: modelContexts,
      size_contexts: sizeContexts,
      json_scripts: jsonScripts.slice(0, 3),
    };

    result.ok = true;
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

module.exports = { checkEbay };
