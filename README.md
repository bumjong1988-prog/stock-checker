# Stock Checker

셀러박스 재고 교차 비교 도구
- 무신사 · ABC마트 · eBay 사이즈별 재고 동시 조회
- 소싱처 품절인데 eBay 활성인 사이즈 자동 알림

## 구조
```
api/
  check.js          - 메인 엔드포인트 (POST /api/check)
  lib/
    fetcher.js      - 공통 fetch 유틸
    ebay.js         - eBay 파서
    musinsa.js      - 무신사 파서
    abc.js          - ABC마트 파서
index.html          - 테스트 UI
```

## 사용
- POST /api/check
  - body: `{ urls: { ebay, musinsa, abc } }`
- GET /api/check?ebay=...&musinsa=...&abc=...

## 배포
GitHub push → Vercel 자동 배포
