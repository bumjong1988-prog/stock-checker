const fetch = require('node-fetch');

const DESKTOP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

async function fetchHtml(url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: { ...DESKTOP_HEADERS, ...extraHeaders },
    timeout: 15000,
    redirect: 'follow',
  });
  const html = await res.text();
  return { status: res.status, html, url: res.url };
}

module.exports = { fetchHtml };
