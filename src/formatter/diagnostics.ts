// Only locally defined labels leave this boundary. Never serialize provider error messages.
const messages = {
  missing_key: '未設定 API key，請用隱藏輸入啟動器。',
  invalid_key_format: 'API key 格式不正確；請貼完整 key，不含星號、引號、空白或 Markdown 跳脫字元。',
  authentication: 'OpenAI 拒絕此 key（401）；請確認 key 完整、未撤銷且屬於正確專案。',
  quota: 'OpenAI 回報額度不足；請檢查 API 專案的付款、餘額及預算（ChatGPT 訂閱不等於 API 額度）。',
  rate_limit: 'OpenAI 暫時限流；請稍後手動重試，本程式不自動重試計費請求。',
  permission: '目前專案或 key 沒有這個 API／模型的使用權限。',
  model_unavailable: '指定模型不可用或此專案無權限，請檢查 OPENAI_FORMATTER_MODEL。',
  request_schema: 'OpenAI 拒絕 Structured Outputs schema 或請求參數，需修正程式。',
  bad_request: 'OpenAI 拒絕請求（400）；請提供此安全診斷代碼給開發者。',
  provider_unavailable: 'OpenAI 服務暫時異常，請稍後重試。',
  http_error: 'OpenAI 回傳非成功 HTTP 狀態。',
  timeout: 'LLM 超過設定等待時間；網路慢或首次 schema 處理可能較久。',
  network: '無法完成 HTTPS 連線，請檢查網路、代理、DNS 與防火牆。',
  tls: 'HTTPS 憑證驗證失敗；請修正受信任憑證／代理設定，不要停用 TLS 驗證。',
  invalid_response: 'OpenAI 回應不是預期的 Responses API 格式。',
  incomplete: '模型回應未完成，沒有使用部分輸出。',
  output_limit: '模型輸出達 token 上限；請縮短需求，或由開發者調整上限。',
  refusal: '模型拒絕解析此輸入；請檢查需求內容。',
  output_schema: '模型輸出未通過本地 JSON Schema 驗證。',
  output_evidence: '模型抽取的數值或條件無法對應原文，已拒絕使用。',
  output_semantics: '模型輸出不符合商品偏好／需求契約，已拒絕使用。',
  credential_detected: '輸入或輸出疑似包含 API key，已拒絕記錄及使用。',
  internal: 'Formatter 內部錯誤；請提供安全診斷代碼給開發者。',
} as const;
export type DiagnosticCode = keyof typeof messages;
export type LlmDiagnostic = {
  code: DiagnosticCode; stage: 'config' | 'request' | 'response' | 'validation';
  http_status: number | null; request_id: string | null; elapsed_ms: number; message: string;
};
export class FormatterLlmError extends Error {
  readonly diagnostic: LlmDiagnostic;
  constructor(code:DiagnosticCode,stage:LlmDiagnostic['stage'],status:number|null=null,requestId:string|null=null,elapsedMs=0) {
    super(`formatter_llm:${code}`);this.name='FormatterLlmError';
    this.diagnostic={code,stage,http_status:status,
      request_id:requestId&&/^req_[a-f0-9-]{8,128}$/i.test(requestId)?requestId:null,
      elapsed_ms:Math.max(0,Math.round(elapsedMs)),message:messages[code]};
  }
}
export function httpDiagnostic(status:number,body:unknown):DiagnosticCode {
  const error=body&&typeof body==='object'?'error' in body?(body as {error:unknown}).error:null:null;
  const code=error&&typeof error==='object'&&'code' in error?(error as {code:unknown}).code:null;
  if(status===401)return 'authentication';
  if(status===403)return 'permission';
  if(code==='insufficient_quota'||code==='billing_hard_limit_reached')return 'quota';
  if(code==='model_not_found'||status===404)return 'model_unavailable';
  if(code==='invalid_json_schema'||code==='invalid_schema'||code==='unsupported_parameter')return 'request_schema';
  if(status===429)return 'rate_limit';
  if(status>=500)return 'provider_unavailable';
  if(status===400)return 'bad_request';
  return 'http_error';
}
