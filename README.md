# OfferMesh

> Many sellers. One best deal.

OfferMesh 是 Sea × OpenAI Regional Codex Hackathon Taiwan 的一日 MVP。使用者只要描述商品、預算與交期，Buyer Agent 就會同時向多個 Seller Agent 議價，再由不受廣告影響的 Evaluator 推薦最符合需求的方案。

## Demo 主線

1. 解析自然語言中的硬性條件與偏好。
2. 找出三家策略不同的 Seller（其中一家為 Sponsored）。
3. 平行進行兩輪議價，產生個人化 Offer。
4. 先以程式規則排除超預算或逾期報價。
5. Evaluator 排序合格方案並說明取捨。
6. 使用者確認後建立 15 分鐘有效的 Quote ID。

## 本機啟動

需要 Node.js 20 以上版本。

```bash
npm install
npm run dev
```

開啟 <http://localhost:3000>。首頁已內建範例需求，無需 API key。

## 驗證

```bash
npm test
npm run build
```

## 核心介面

```ts
parseRequest(text) => BuyerIntent
discoverSellers(intent) => Seller[]
negotiate(intent, seller) => NegotiationResult
evaluateOffers(intent, results) => Decision
```

所有核心邏輯集中在 `lib/market.ts`，畫面透過 `POST /api/negotiate` 使用同一套流程，避免 Demo 與測試產生不同結果。

## Demo 保命設計

- 固定 Seller 商品與策略，結果可重現。
- 規則引擎是完整 fallback，斷網也能跑。
- Sponsored 只影響 Discovery 顯示順序，不進入 Evaluator 分數。
- UI 不宣稱真實付款，只在人工確認後顯示模擬 Quote ID。
