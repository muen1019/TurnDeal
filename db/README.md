# TurnDeal SQLite

SQLite 是 Backend 的唯一持久狀態來源。`db/migrations/`、versioned fixtures 與 seed scripts 是 schema／初始資料正本；runtime database、WAL、SHM 與 backup 不提交 Git。

## Runtime databases

| 路徑 | 用途 |
| --- | --- |
| `data/app.sqlite` | Node 24 完整應用 |
| `backend/data/result-v02.sqlite` | Node 20 legacy Result server |
| 其他 `data/*.sqlite` | 獨立 demo／E2E，本機產物 |

同一檔案只能有一個 writer。完整應用啟動時套用缺少的 migrations 與 versioned seed；不得重設既有價格、庫存、權益額度、Offer 或 snapshot。

## 指令

```powershell
npm run db:init
npm run db:migrate
npm run db:check
npm run test:db
```

`db:migrate` 用於既有資料庫，會先建立被 Git 忽略的 backup。只有確定要丟棄本機 demo data 時才使用破壞性的 `npm run db:rebuild`；不能對運行中或需要保留的資料庫執行。

Discovery／Seller policy seed：

```powershell
npm run db:seed:discovery
npm run db:seed:policies
```

相同 seed version 重跑必須是 idempotent；內容衝突時拒絕，不能覆寫現場資料。

## 資料區域

- Catalog／Seller：sources、products、inventory、terms、campaigns、Persona、SKU policies、benefits 與 listing bindings。
- Request／Formatter：documents、NormalizedIntent、formatter runs 與固定偏好來源。
- Discovery／Orchestrator：Catalog snapshots、ranking runs 與 handoff plans。
- Negotiation：runs、round commits、Offer versions 與 shared context。
- Evaluation／Result：evaluation runs、published snapshots 與獨立 decision state。
- Improver：jobs、document revisions、global preference versions、clarifications 與 child links。
- Purchase：purchase operations、merchant sessions／orders、test inventory、events 與 idempotency。

實際表名與順序以 migration files 為準，不要只依文件推測 schema。

## 不可變與恢復

- Published Request snapshots、source documents、Offer versions 和 negotiation commits 不更新。
- Accept／reject result 使用獨立 decision state；reject 保留原始 feedback／source documents。
- 已完成 idempotent operation 永久重播原 status／body。
- Model／network call 不持有 SQLite transaction。
- 啟動只恢復有明確 durable semantics 的工作；不能重送結果未知且可能已有副作用的操作。
- 舊 layout 以 migration 升級並保留歷史價格；不要透過重新 seed 偽造遷移。

Preference 欄位存在不代表 UI、Formatter 與 Improver 的所有版本庫已完全同步。現行界線見 [intent／preference 規格](../docs/INTENT_PREFERENCE_SPEC.md)。
