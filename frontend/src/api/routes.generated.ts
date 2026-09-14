/* Generated from backend/openapi.json. */
export const apiPaths = {
  "getBuyerProfile": "/api/buyer-profile",
  "saveBuyerProfile": "/api/buyer-profile",
  "createRequest": "/api/requests",
  "getRequestResult": "/api/requests/{request_id}",
  "submitDecision": "/api/requests/{request_id}/decisions",
  "createPurchase": "/api/requests/{request_id}/purchases",
  "getRequestPurchase": "/api/requests/{request_id}/purchase",
  "getPurchase": "/api/purchases/{purchase_id}",
  "updatePurchase": "/api/purchases/{purchase_id}/checkout",
  "completePurchase": "/api/purchases/{purchase_id}/complete",
  "cancelPurchase": "/api/purchases/{purchase_id}/cancel",
  "getRequestImprovement": "/api/requests/{request_id}/improvement",
  "clarifyImprovement": "/api/requests/{request_id}/improvement/clarifications",
  "getUserPreference": "/api/preferences",
  "updateUserPreference": "/api/preferences"
} as const;
