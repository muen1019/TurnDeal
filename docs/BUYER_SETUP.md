# 初次設定與偏好權重

首次進入：基本資料 → 偏好 → 購物首頁。既有 Request 連結仍可查看，不因未設定資料而阻擋讀取或原提交核對。設定入口可重新編輯；只有儲存成功才完成 onboarding。

基本資料：名稱（必填）、運送地址（Demo 選填）、付款方式（稍後決定／信用卡／行動支付／貨到付款）。不收卡號、CVV、金融帳戶，也沒有付款授權。請用虛構資料展示。資料由本機固定 demo buyer 保存到 SQLite buyer_profiles；不是登入系統，不供公開部署。基本資料只給設定頁使用，不放入 intent、RFQ 或模型。

購物偏好：價格、速度、賣家評價、顏色四個重要程度（0–100，至少一項非零），再正規化成相對百分比。顏色可複選，沒有選色時不計顏色分數，其餘重新正規化。偏好顏色是軟條件，不等於必須符合。首次未操作的滑桿是產品預設值，不是推測出的個人偏好。

新增 GET／POST `/api/buyer-profile`，共用 BuyerProfile／BuyerProfileResponse schema；POST 需 Idempotency-Key、同 buyer 作用域。SQLite 用 007_buyer_profiles.sql 加表和 requests.ranking_weights_json 欄位。設定儲存是明示持久更新，不由 Formatter 學習或改寫 user_preferences。

建立 Request 時凍結權重；如果沒有自訂 preference_md，使用 profile 顏色生成本輪偏好文字。自訂 preference_md 優先。clarification child 繼承 parent 的偏好文字／權重，不受途中更改設定影響。姓名、地址、付款方式永遠不進購物文件。舊需求沒有權重時沿用既有排序。

NormalizedIntent 新增 optional ranking_weights。沒有明示 price_first／delivery_first／trust_first 時，Discovery 與 Evaluator 使用四項加權：價格 100×(1−總價/預算上限)、速度 100×(1−(到貨天數−1)/交期上限)、賣家評分/5×100（無評分採中性值3）、顏色符合為100／不符合或未知為0。每項限制在0–100。Discovery 的目標價若有提供則沿用目標接近程度。權重只影響軟排序，不能突破預算／交期等硬限制；本輪明示優先順序高於設定權重。Sponsored 永遠不入分數。

EvaluatorInput 可有後端依已验证 catalog 投影的 color_matches（offer_id、score），不從 SKU 名稱猜色、不傳商家私有資料。Evaluator 的模型與 fallback 都服從同一 comparator；模型只解釋驗證過的順序。

前端不把姓名／地址存入 sessionStorage，也不帶入任何模型请求。資料在本機 SQLite 與冪等重播紀錄內是明文；沒有加密保管或正式 checkout。公開／多人帳號部署必須另做認證、資料保護與金流整合。
