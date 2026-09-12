import { useCallback, useEffect, useRef, useState } from "react";
import type { RequestSnapshot } from "../contract.generated";
import {
  ApiFailure,
  apiPaths,
  decisionPath,
  composeRequest,
  decisionResponse,
  getSnapshot,
  postJournal,
  validateSnapshot,
} from "../api/client";
import {
  currentRank,
  freshConversation,
  loadPending,
  loadWorkspace,
  parseLocation,
  patchConversation,
  pendingKey,
  processing,
  saveWorkspace,
  skipOffer,
  undoSkip,
  type Conversation,
  type InputSource,
  type Pending,
  type View,
  type Workspace,
} from "./model";

interface PendingBoot {
  pending: Pending | null;
  blocked: boolean;
  error: string;
}

export function useWorkspace() {
  const [boot] = useState(() => loadWorkspace());
  const [pendingBoot] = useState<PendingBoot>(() => {
    try {
      return { pending: loadPending(), blocked: false, error: "" };
    } catch (error) {
      return {
        pending: null,
        blocked: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const [workspace, setWorkspace] = useState(boot.workspace);
  const ref = useRef(workspace);
  const [view, setView] = useState<View>(parseLocation().view);
  const [detailId, setDetailId] = useState<string | null>(parseLocation().offerId);
  const [error, setError] = useState(boot.error || pendingBoot.error);
  const [pending, setPending] = useState<Pending | null>(pendingBoot.pending);
  const pendingRef = useRef(pendingBoot.pending);
  const [unknown, setUnknown] = useState(pendingBoot.blocked);
  const [pendingBlocked, setPendingBlocked] = useState(pendingBoot.blocked);
  const blockedRef = useRef(pendingBoot.blocked);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const retryNotBefore = useRef(0);
  const [saving, setSaving] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [source, setSource] = useState<InputSource>("pointer");
  const sourceRef = useRef<InputSource>("pointer");

  const update = useCallback((change: (workspace: Workspace) => Workspace) => {
    const next = change(ref.current);
    ref.current = next;
    setWorkspace(next);

    try {
      saveWorkspace(next);
    } catch {
      setError("無法保存本分頁草稿；目前畫面仍可繼續操作。");
    }

    return next;
  }, []);

  const patch = useCallback(
    (id: string, patchValue: Partial<Conversation>) =>
      update((workspace) => patchConversation(workspace, id, patchValue)),
    [update],
  );

  const active =
    workspace.conversations.find((conversation) => conversation.id === workspace.activeId) ??
    workspace.conversations[0];

  const live = () =>
    ref.current.conversations.find(
      (conversation) => conversation.id === ref.current.activeId,
    ) ?? ref.current.conversations[0];

  const isLocked = useCallback(
    () => blockedRef.current || Boolean(pendingRef.current) || running.current,
    [],
  );

  const navigate = useCallback(
    (next: View, id?: string | null, offerId?: string | null, replace = false) => {
      setView(next);
      setDetailId(offerId ?? null);

      const requestId =
        id === undefined
          ? ref.current.conversations.find(
              (conversation) => conversation.id === ref.current.activeId,
            )?.requestId
          : id;
      const url =
        next === "chat" || next === "settings"
          ? `/chat${requestId ? `?request_id=${encodeURIComponent(requestId)}` : ""}`
          : requestId
            ? `/requests/${encodeURIComponent(requestId)}${
                next === "details"
                  ? `?view=details&offer_id=${encodeURIComponent(offerId ?? "")}`
                  : ""
              }`
            : "/chat";

      if (replace) {
        history.replaceState(null, "", url);
      } else if (location.pathname + location.search !== url) {
        history.pushState(null, "", url);
      }
    },
    [],
  );

  const adoptLocation = useCallback(() => {
    const locationState = parseLocation();
    setView(locationState.view);
    setDetailId(locationState.offerId);

    if (!locationState.requestId) {
      return;
    }

    const found = ref.current.conversations.find(
      (conversation) => conversation.requestId === locationState.requestId,
    );

    if (found) {
      update((workspace) => ({ ...workspace, activeId: found.id }));
    } else {
      const conversation = {
        ...freshConversation(),
        requestId: locationState.requestId,
        title: "已發布的購物需求",
        historyMissing: true,
      };
      update((workspace) => ({
        ...workspace,
        activeId: conversation.id,
        conversations: [conversation, ...workspace.conversations],
      }));
    }

    setVerified(null);
    setRefresh((value) => value + 1);
  }, [update]);

  useEffect(() => {
    adoptLocation();
    const pop = () => adoptLocation();
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [adoptLocation]);

  useEffect(() => {
    const key = () => {
      sourceRef.current = "keyboard";
      setSource("keyboard");
    };
    const pointer = () => {
      sourceRef.current = "pointer";
      setSource("pointer");
    };

    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", pointer, true);

    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", pointer, true);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const requestId = active.requestId;
    if (!requestId) {
      return;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const conversationId = active.id;

    const poll = async () => {
      try {
        const snapshot = await getSnapshot(requestId, controller.signal);
        if (stopped) {
          return;
        }

        patch(conversationId, { snapshot });
        setVerified(requestId);

        if (processing(snapshot.status)) {
          timer = setTimeout(poll, 1000);
        }
      } catch (pollError) {
        if (!stopped) {
          setVerified(null);
          setError(pollError instanceof Error ? pollError.message : "讀取狀態失敗");
        }
      }
    };

    void poll();

    return () => {
      stopped = true;
      controller.abort();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [active.requestId, active.id, refresh, patch, navigate]);

  const clearJournal = useCallback(() => {
    sessionStorage.removeItem(pendingKey);
    pendingRef.current = null;
    blockedRef.current = false;
    setPending(null);
    setPendingBlocked(false);
    setUnknown(false);
  }, []);

  const recoverConversation = useCallback(
    (pendingValue: Pending, snapshot: RequestSnapshot) => {
      const byConversationId = pendingValue.conversationId
        ? ref.current.conversations.find(
            (conversation) => conversation.id === pendingValue.conversationId,
          )
        : null;
      const byRequestId = ref.current.conversations.find(
        (conversation) => conversation.requestId === snapshot.request_id,
      );

      if (byConversationId) {
        patch(byConversationId.id, {
          requestId: snapshot.request_id,
          snapshot,
          draft: byConversationId.draft.trim() === byConversationId.message ? "" : byConversationId.draft,
        });
        return byConversationId.id;
      }

      if (byRequestId) {
        patch(byRequestId.id, { snapshot });
        return byRequestId.id;
      }

      const recovered = {
        ...freshConversation(),
        requestId: snapshot.request_id,
        snapshot,
        draft: "",
        message:
          typeof pendingValue.body.intent_md === "string"
            ? pendingValue.body.intent_md.slice(0, 80)
            : "",
        title: "已恢復的購物需求",
        historyMissing: true,
      };

      update((workspace) => ({
        ...workspace,
        activeId: recovered.id,
        conversations: [recovered, ...workspace.conversations],
      }));

      return recovered.id;
    },
    [patch, update],
  );

  const applySnapshotByScope = useCallback(
    (pendingValue: Pending, snapshot: RequestSnapshot) => {
      const conversation =
        (pendingValue.conversationId &&
          ref.current.conversations.find(
            (item) => item.id === pendingValue.conversationId,
          )) ||
        ref.current.conversations.find(
          (item) => item.requestId === snapshot.request_id,
        );

      if (!conversation) {
        return recoverConversation(pendingValue, snapshot);
      }

      patch(conversation.id, { snapshot });
      return conversation.id;
    },
    [patch, recoverConversation],
  );

  const execute = useCallback(
    async (pendingValue: Pending) => {
      if (running.current || blockedRef.current || Date.now() < retryNotBefore.current) {
        return;
      }

      running.current = true;
      setBusy(true);
      setUnknown(false);
      setError("");

      try {
        const raw = await postJournal(
          pendingValue.path,
          pendingValue.body,
          pendingValue.key,
        );

        if (pendingValue.kind === "create") {
          const snapshot = validateSnapshot(raw);
          const conversationId = recoverConversation(pendingValue, snapshot);
          setVerified(snapshot.request_id);

          if (live().id === conversationId) {
            navigate("chat", snapshot.request_id, undefined, true);
          }
        } else {
          const result = decisionResponse(raw);

          if (
            result.request_id !== pendingValue.requestId ||
            result.action !== pendingValue.kind
          ) {
            throw new ApiFailure(0, "invalid_response", "決策回應不符合原提交。");
          }

          if (result.action === "accept") {
            if (result.selected_offer_id !== pendingValue.body.offer_id) {
              throw new ApiFailure(0, "invalid_response", "接受的 offer 不符合原提交。");
            }

            update((workspace) => {
              const conversation = findPendingConversation(workspace, pendingValue);
              if (!conversation) {
                return workspace;
              }

              return patchConversation(workspace, conversation.id, {
                snapshot: conversation.snapshot
                  ? {
                      ...conversation.snapshot,
                      status: "accepted",
                      selected_offer_id: result.selected_offer_id,
                      decision: result,
                    }
                  : null,
              });
            });

            if (live().id === pendingValue.conversationId) {
              navigate("offers", pendingValue.requestId);
            }
          } else {
            if(result.feedback !== pendingValue.body.feedback) throw new ApiFailure(0,'invalid_response','回饋回應不符合原提交。');
            update(workspace => {
              const conversation=findPendingConversation(workspace,pendingValue);
              if(!conversation) return workspace;
              if(conversation.snapshot && (result.source_documents.revision!==conversation.snapshot.documents.revision || result.source_documents.intent_md!==conversation.snapshot.documents.intent_md || result.source_documents.preference_md!==conversation.snapshot.documents.preference_md)) throw new ApiFailure(0,'invalid_response','回傳文件不符合原需求。');
              return patchConversation(workspace, conversation.id, {
                feedback: "",
                feedbackHistory: [
                  ...(conversation.feedbackHistory ?? []),
                  String(pendingValue.body.feedback ?? ""),
                ],
                snapshot: conversation.snapshot
                  ? {
                      ...conversation.snapshot,
                      status: "rejected",
                      error: null,
                      decision: result,
                    }
                  : null,
              });
            });
            if(live().id===pendingValue.conversationId) navigate('offers',pendingValue.requestId);
          }
        }

        clearJournal();
        setSource(pendingValue.source);
        setRefresh((value) => value + 1);
      } catch (executeError) {
        const apiError = executeError instanceof ApiFailure ? executeError : null;
        if (apiError?.code === "request_in_progress") {
          retryNotBefore.current = Date.now() + apiError.retryAfter * 1000;
        }
        setError(executeError instanceof Error ? executeError.message : "提交失敗。");

        const definite =
          apiError &&
          [400, 404, 410, 422, 503].includes(apiError.status) &&
          apiError.code !== "invalid_response";

        if (definite) {
          try {
            clearJournal();
          } catch {
            setUnknown(true);
          }

          if (
            apiError.status === 410 &&
            typeof pendingValue.body.offer_id === "string"
          ) {
            const expiredId = pendingValue.body.offer_id;
            update((workspace) => {
              const conversation = findPendingConversation(workspace, pendingValue);
              return conversation
                ? patchConversation(workspace, conversation.id, {
                    unavailableIds: [
                      ...new Set([
                        ...(conversation.unavailableIds ?? []),
                        expiredId,
                      ]),
                    ],
                  })
                : workspace;
            });
          }

          setRefresh((value) => value + 1);
        } else if (
          apiError?.status === 409 &&
          apiError.code === "state_conflict" &&
          pendingValue.requestId
        ) {
          try {
            const snapshot = await getSnapshot(pendingValue.requestId);
            applySnapshotByScope(pendingValue, snapshot);
            setVerified(pendingValue.requestId);
            clearJournal();
            setRefresh((value) => value + 1);
          } catch {
            setUnknown(true);
          }
        } else {
          setUnknown(true);
        }
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [applySnapshotByScope, clearJournal, navigate, recoverConversation, update],
  );

  const submit = useCallback(
    (pendingInput: Omit<Pending, "key" | "source">) => {
      if (isLocked()) {
        return;
      }

      const journal: Pending = {
        ...pendingInput,
        key: crypto.randomUUID(),
        source: sourceRef.current,
      };

      try {
        sessionStorage.setItem(pendingKey, JSON.stringify(journal));
      } catch {
        setError("無法保存提交紀錄，因此尚未送出；請允許本分頁儲存後重試。");
        return;
      }

      pendingRef.current = journal;
      setPending(journal);
      void execute(journal);
    },
    [execute, isLocked],
  );

  useEffect(() => {
    if (pendingBlocked) {
      return;
    }

    try {
      const pendingValue = loadPending();
      if (pendingValue) {
        pendingRef.current = pendingValue;
        setPending(pendingValue);
        void execute(pendingValue);
      }
    } catch (replayError) {
      blockedRef.current = true;
      setPendingBlocked(true);
      setError(replayError instanceof Error ? replayError.message : String(replayError));
      setUnknown(true);
    }
  }, [execute, pendingBlocked]);

  const saveDefinitions = () => {
    setSaving(true);
    setError("");

    const definitions = ref.current.definitions;

    try {
      if (
        !definitions.intent.trim() ||
        [...definitions.intent].length > 20000 ||
        [...definitions.preference].length > 20000
      ) {
        throw new Error("intent.md 不可空白，兩份定義各最多 20000 個字元。");
      }

      const next = {
        ...ref.current,
        definitions: {
          ...definitions,
          savedIntent: definitions.intent,
          savedPreference: definitions.preference,
          version: definitions.version + 1,
        },
      };
      saveWorkspace(next);
      ref.current = next;
      setWorkspace(next);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "設定儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const send = () => {
    const conversation = live();

    if (isLocked() || saving || processing(conversation.snapshot?.status)) {
      return;
    }

    if (
      conversation.snapshot &&
      ["awaiting_user", "no_match", "needs_confirmation"].includes(
        conversation.snapshot.status,
      )
    ) {
      navigate("feedback", conversation.requestId);
      patch(conversation.id, { feedback: conversation.draft });
      return;
    }

    if (conversation.requestId) {
      setError("本輪已有結果，請使用「新對話」開始另一個購買需求。");
      return;
    }

    try {
      const definitions = ref.current.definitions;
      const body = composeRequest(
        definitions.savedIntent,
        definitions.savedPreference,
        conversation.draft,
      );
      patch(conversation.id, {
        message: conversation.draft.trim(),
        title: conversation.draft.trim().slice(0, 22),
        definitionVersion: definitions.version,
      });
      submit({
        kind: "create",
        path: apiPaths.createRequest,
        body: { ...body },
        conversationId: conversation.id,
        requestId: null,
      });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "需求無法送出");
    }
  };

  const accept = (offerId?: string) => {
    const conversation = live();
    const id = offerId ?? currentRank(conversation)?.offer_id;
    const offer = conversation.snapshot?.offers.find((item) => item.offer_id === id);

    if (
      isLocked() ||
      verified !== conversation.requestId ||
      conversation.snapshot?.status !== "awaiting_user" ||
      !offer ||
      offer.eligibility.status !== "eligible" ||
      conversation.unavailableIds?.includes(offer.offer_id) ||
      Date.parse(offer.expires_at) <= Date.now()
    ) {
      return;
    }

    submit({
      kind: "accept",
      path: decisionPath(conversation.requestId!),
      body: { action: "accept", offer_id: offer.offer_id },
      conversationId: conversation.id,
      requestId: conversation.requestId,
    });
  };

  const reject = () => {
    const conversation = live();
    const text = conversation.feedback;

    if (
      isLocked() ||
      !conversation.requestId ||
      verified !== conversation.requestId ||
      !["awaiting_user", "no_match", "needs_confirmation"].includes(
        conversation.snapshot?.status ?? "",
      )
    ) {
      return;
    }

    if (!text.trim() || [...text].length > 2000) {
      setError("回饋請輸入 1–2000 個字元。");
      return;
    }

    submit({
      kind: "reject",
      path: decisionPath(conversation.requestId),
      body: { action: "reject", feedback: text },
      conversationId: conversation.id,
      requestId: conversation.requestId,
    });
  };

  const skip = () => {
    const conversation = live();
    if (isLocked() || conversation.snapshot?.status !== "awaiting_user") {
      return;
    }

    const next = skipOffer(conversation);
    patch(conversation.id, { skipped: next.skipped });
    if (!currentRank(next)) {
      navigate("feedback", conversation.requestId);
    }
  };

  const undo = () => {
    const conversation = live();
    if (isLocked() || conversation.snapshot?.status !== "awaiting_user") {
      return;
    }

    patch(conversation.id, { skipped: undoSkip(conversation).skipped });
    navigate("offers", conversation.requestId);
  };

  const review = () => {
    if (isLocked()) {
      return;
    }

    const conversation = live();
    patch(conversation.id, { skipped: [] });
    navigate("offers", conversation.requestId);
  };

  const newConversation = () => {
    const conversation = freshConversation();
    update((workspace) => ({
      ...workspace,
      conversations: [conversation, ...workspace.conversations],
      activeId: conversation.id,
    }));
    setVerified(null);
    setError("");
    navigate("chat", null);
  };

  const selectConversation = (id: string) => {
    const conversation = ref.current.conversations.find((item) => item.id === id);
    if (!conversation) {
      return;
    }

    update((workspace) => ({ ...workspace, activeId: id }));
    setVerified(null);
    navigate("chat", conversation.requestId);
    setRefresh((value) => value + 1);
  };

  return {
    workspace,
    active,
    view,
    detailId,
    error,
    setError,
    pending,
    unknown,
    busy,
    saving,
    verified,
    now,
    source,
    navigate,
    patch,
    update,
    saveDefinitions,
    send,
    accept,
    reject,
    skip,
    undo,
    review,
    newConversation,
    selectConversation,
    retry: () =>
      pendingRef.current && !blockedRef.current
        ? void execute(pendingRef.current)
        : setRefresh((value) => value + 1),
  };
}

function findPendingConversation(workspace: Workspace, pendingValue: Pending) {
  return (
    (pendingValue.conversationId &&
      workspace.conversations.find(
        (conversation) => conversation.id === pendingValue.conversationId,
      )) ||
    (pendingValue.requestId &&
      workspace.conversations.find(
        (conversation) => conversation.requestId === pendingValue.requestId,
      )) ||
    null
  );
}
