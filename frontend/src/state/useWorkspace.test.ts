import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import apiExamples from "../../../contracts/fixtures/result-api-v0.3.json";
import fixture from "../../../contracts/fixtures/result-v0.3.json";
import { validateSnapshot } from "../api/client";
import { pendingKey, storageKey, type Workspace } from "./model";
import { useWorkspace } from "./useWorkspace";

const requestBody = apiExamples.create_request.body;
const createResponse = apiExamples.create_request.response;
const acceptResponse = apiExamples.accept_decision.response;
const rejectResponse = apiExamples.reject_decision_alternative.response;

beforeEach(() => {
  sessionStorage.clear();
  history.replaceState(null, "", "/chat");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useWorkspace pending recovery", () => {
  it('clears every local draft, preserves settings and blocks clearing processing requests',()=>{
    const {result}=renderHook(()=>useWorkspace());
    act(()=>result.current.patch(result.current.active.id,{draft:'private draft'}));
    act(()=>result.current.newConversation());
    const definitions=result.current.workspace.definitions;
    act(()=>result.current.clearHistory());
    expect(result.current.workspace.conversations).toHaveLength(1);
    expect(result.current.workspace.definitions).toEqual(definitions);
    expect(sessionStorage.getItem(storageKey)).not.toContain('private draft');
    act(()=>result.current.patch(result.current.active.id,{snapshot:validateSnapshot(createResponse)}));
    const frozen=result.current.workspace;
    act(()=>result.current.clearHistory());expect(result.current.workspace).toBe(frozen);
  });
  it('deletes one local conversation, preserves others, and replaces the last with a fresh draft',()=>{
    const {result}=renderHook(()=>useWorkspace());
    const first=result.current.active.id;
    act(()=>result.current.patch(first,{draft:'temporary'}));
    act(()=>result.current.newConversation());const second=result.current.active.id;
    act(()=>result.current.deleteConversation(first));
    expect(result.current.workspace.conversations.map(c=>c.id)).toEqual([second]);
    expect(sessionStorage.getItem(storageKey)).not.toContain('temporary');
    act(()=>result.current.deleteConversation(second));
    expect(result.current.workspace.conversations).toHaveLength(1);expect(result.current.active.requestId).toBeNull();expect(result.current.active.id).not.toBe(second);
  });
  it('preserves parent documents and answer drafts while creating a clarification child',async()=>{
    const parent={...createResponse,status:'needs_clarification',formatter:{provider:'rules',model:null,questions:[{question_id:'q_0',field:'budget',text:'最高預算？',suggestions:[]}]}};
    const child={...createResponse,request_id:'req_child',root_request_id:parent.request_id,parent_request_id:parent.request_id,documents:{...parent.documents,revision:2}};
    const workspace=workspaceWithRequest(validateSnapshot(parent));
    workspace.conversations[0].snapshot=validateSnapshot(parent);
    sessionStorage.setItem(storageKey,JSON.stringify(workspace));
    const fetchMock=mockFetch((url,init)=>init?.method==='POST'?jsonResponse(child,202):jsonResponse(String(url).includes('req_child')?{...child,status:'failed'}:parent));
    const {result}=renderHook(()=>useWorkspace());
    await waitFor(()=>expect(result.current.verified).toBe(parent.request_id));
    act(()=>result.current.patch(result.current.active.id,{clarificationDraft:{requestId:parent.request_id,answers:{q_0:'1000'}}}));
    expect(JSON.parse(sessionStorage.getItem(storageKey)!).conversations[0].clarificationDraft.answers.q_0).toBe('1000');
    act(()=>{result.current.answerClarification();result.current.answerClarification();});
    await waitFor(()=>expect(result.current.active.requestId).toBe('req_child'));
    expect(postCalls(fetchMock)).toHaveLength(1);
    expect(JSON.parse(String(postCalls(fetchMock)[0][1]?.body))).toEqual({intent_md:parent.documents.intent_md,preference_md:parent.documents.preference_md,clarification:{parent_request_id:parent.request_id,answers:[{question_id:'q_0',answer:'1000'}]}});
  });
  it("submits in a fresh workspace without saving or injecting optional definitions", async () => {
    const fetchMock = mockFetch((_, init) => init?.method === 'POST'
      ? jsonResponse(createResponse, 202) : jsonResponse(fixture.snapshot));
    const {result} = renderHook(() => useWorkspace());
    expect(result.current.workspace.definitions).toEqual({intent:'',preference:'',savedIntent:'',savedPreference:'',version:0});
    act(() => {
      result.current.patch(result.current.active.id, {draft:'  買滑鼠，預算1000元，7天內到貨。  '});
      result.current.send();
    });
    await waitFor(() => expect(result.current.active.requestId).toBe(createResponse.request_id));
    expect(postCalls(fetchMock)).toHaveLength(1);
    expect(JSON.parse(String(postCalls(fetchMock)[0][1]?.body))).toEqual({intent_md:'買滑鼠，預算1000元，7天內到貨。',preference_md:''});
  });

  it("saves preference-only settings and allows clearing them without changing requests", () => {
    const {result} = renderHook(() => useWorkspace());
    act(() => result.current.update(w => ({...w,definitions:{...w.definitions,preference:'喜歡黑色'}})));
    act(() => result.current.saveDefinitions());
    expect(result.current.error).toBe('');
    expect(result.current.workspace.definitions.savedIntent).toBe('');
    expect(result.current.workspace.definitions.savedPreference).toBe('喜歡黑色');
    act(() => result.current.update(w => ({...w,definitions:{...w.definitions,preference:''}})));
    act(() => result.current.saveDefinitions());
    expect(result.current.workspace.definitions.savedPreference).toBe('');
    expect(result.current.workspace.definitions.version).toBe(2);
    expect(result.current.active.requestId).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(storageKey)!).definitions.savedPreference).toBe('');
  });

  it("keeps the old saved definitions and draft when saveDefinitions cannot write storage", () => {
    const workspace = workspaceWithRequest(null);
    workspace.definitions = {
      intent: "# old saved intent",
      preference: "old preference",
      savedIntent: "# old saved intent",
      savedPreference: "old preference",
      version: 1,
    };
    workspace.conversations[0].draft = "keep this draft";
    sessionStorage.setItem(storageKey, JSON.stringify(workspace));

    const { result } = renderHook(() => useWorkspace());

    act(() => {
      result.current.update((current) => ({
        ...current,
        definitions: {
          ...current.definitions,
          intent: "# new dirty intent",
          preference: "new dirty preference",
        },
        conversations: current.conversations.map((conversation) =>
          conversation.id === current.activeId
            ? { ...conversation, draft: "draft while definitions dirty" }
            : conversation,
        ),
      }));
    });

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    act(() => {
      result.current.saveDefinitions();
    });

    expect(result.current.workspace.definitions.savedIntent).toBe("# old saved intent");
    expect(result.current.workspace.definitions.savedPreference).toBe("old preference");
    expect(result.current.workspace.definitions.version).toBe(1);
    expect(result.current.workspace.definitions.intent).toBe("# new dirty intent");
    expect(result.current.active.draft).toBe("draft while definitions dirty");
    expect(result.current.error).toBeTruthy();
  });
  it("preserves a new draft typed while creation is pending", async () => {
    const deferred = createDeferred<Response>();
    sessionStorage.setItem(storageKey, JSON.stringify(workspaceWithRequest(null)));
    mockFetch((_, init) => init?.method === 'POST' ? deferred.promise : jsonResponse(fixture.snapshot));
    const {result} = renderHook(() => useWorkspace());
    act(() => { result.current.patch('conv_1', {draft:'first request'}); result.current.send(); });
    act(() => result.current.patch('conv_1', {draft:'additional unsent detail'}));
    await act(async () => {deferred.resolve(jsonResponse(createResponse,202)); await deferred.promise;});
    await waitFor(() => expect(result.current.active.requestId).toBe('req_demo_001'));
    expect(result.current.active.draft).toBe('additional unsent detail');
  });

  it("honors Retry-After while preserving the original submission identity", async () => {
    sessionStorage.setItem(storageKey, JSON.stringify(workspaceWithRequest(null)));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000000);
    const fetchMock = mockFetch(() => new Response(JSON.stringify({error:{code:'request_in_progress',message:'Still processing'}}), {status:409, headers:{'Retry-After':'3','Content-Type':'application/json'}}));
    const {result} = renderHook(() => useWorkspace());
    act(() => { result.current.patch('conv_1',{draft:'mouse please'}); result.current.send(); });
    await waitFor(() => expect(result.current.unknown).toBe(true));
    act(() => result.current.retry());
    expect(postCalls(fetchMock)).toHaveLength(1);
    clock.mockReturnValue(1003000);
    act(() => result.current.retry());
    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(2));
    expect(postCalls(fetchMock)[0][1]?.body).toBe(postCalls(fetchMock)[1][1]?.body);
    expect(postCalls(fetchMock)[0][1]?.headers).toEqual(postCalls(fetchMock)[1][1]?.headers);
  });

  it("replays one exact create key in StrictMode and recovers an orphaned conversation", async () => {
    const fetchMock = mockFetch((path, init) => {
      if (init?.method === "POST" && path === "/api/requests") {
        return jsonResponse(createResponse, 202);
      }

      return jsonResponse(fixture.snapshot);
    });

    sessionStorage.setItem(
      pendingKey,
      JSON.stringify({
        kind: "create",
        path: "/api/requests",
        body: requestBody,
        key: "same-create-key",
        requestId: null,
        source: "keyboard",
      }),
    );

    const { result } = renderHook(() => useWorkspace(), { wrapper: Strict });

    await waitFor(() => {
      expect(
        result.current.workspace.conversations.some(
          (conversation) => conversation.requestId === "req_demo_001",
        ),
      ).toBe(true);
    });

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][1]?.headers).toMatchObject({
      "Idempotency-Key": "same-create-key",
    });
    expect(sessionStorage.getItem(pendingKey)).toBeNull();
  });

  it("keeps a corrupt pending journal locked instead of allowing a competing POST", async () => {
    const fetchMock = mockFetch(() => jsonResponse(createResponse, 202));
    sessionStorage.setItem(pendingKey, "{");

    const { result } = renderHook(() => useWorkspace());

    act(() => {
      result.current.update((workspace) => ({
        ...workspace,
        definitions: {
          ...workspace.definitions,
          savedIntent: "# intent",
          savedPreference: "",
          version: 1,
        },
        conversations: workspace.conversations.map((conversation) =>
          conversation.id === workspace.activeId
            ? { ...conversation, draft: "need a mouse" }
            : conversation,
        ),
      }));
      result.current.send();
    });

    expect(result.current.unknown).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(pendingKey)).toBe("{");
  });

  it("treats oversized invalid-json create responses as uncertain and keeps the original lock", async () => {
    const workspace = workspaceWithRequest(null);
    sessionStorage.setItem(storageKey, JSON.stringify(workspace));
    sessionStorage.setItem(
      pendingKey,
      JSON.stringify({
        kind: "create",
        path: "/api/requests",
        body: requestBody,
        key: "large-body-key",
        conversationId: "conv_1",
        requestId: null,
        source: "pointer",
      }),
    );

    const fetchMock = mockFetch(() => new Response("too large", { status: 413 }));
    const { result } = renderHook(() => useWorkspace());

    await waitFor(() => expect(result.current.unknown).toBe(true));

    act(() => {
      result.current.update((current) => ({
        ...current,
        definitions: {
          ...current.definitions,
          savedIntent: "# intent",
          savedPreference: "",
          version: 1,
        },
        conversations: current.conversations.map((conversation) =>
          conversation.id === current.activeId
            ? { ...conversation, draft: "another mouse" }
            : conversation,
        ),
      }));
      result.current.send();
    });

    expect(postCalls(fetchMock)).toHaveLength(1);
    expect(JSON.parse(sessionStorage.getItem(pendingKey) ?? "{}").key).toBe(
      "large-body-key",
    );
  });

  it("uses authoritative GET after state_conflict and clears the decision journal", async () => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify(workspaceWithRequest(validateSnapshot(structuredClone(fixture.snapshot)))),
    );
    sessionStorage.setItem(
      pendingKey,
      JSON.stringify({
        kind: "accept",
        path: "/api/requests/req_demo_001/decisions",
        body: { action: "accept", offer_id: "offer_a_r5" },
        key: "accept-key",
        conversationId: "conv_1",
        requestId: "req_demo_001",
        source: "pointer",
      }),
    );

    const authoritative = {
      ...structuredClone(fixture.snapshot),
      status: "accepted",
      selected_offer_id: "offer_a_r5",
      decision: acceptResponse,
    };
    const fetchMock = mockFetch((path, init) => {
      if (init?.method === "POST") {
        return jsonResponse(
          { error: { code: "state_conflict", message: "state changed", fields: [] } },
          409,
        );
      }

      expect(path).toBe("/api/requests/req_demo_001");
      return jsonResponse(authoritative);
    });

    const { result } = renderHook(() => useWorkspace());

    await waitFor(() => {
      expect(result.current.active.snapshot?.status).toBe("accepted");
    });

    expect(postCalls(fetchMock)).toHaveLength(1);
    expect(sessionStorage.getItem(pendingKey)).toBeNull();
    expect(result.current.verified).toBe("req_demo_001");
  });

  it("applies a late create response only to its original conversation", async () => {
    const deferred = createDeferred<Response>();
    const fetchMock = mockFetch((path, init) => {
      if (init?.method === "POST" && path === "/api/requests") {
        return deferred.promise;
      }

      return jsonResponse(fixture.snapshot);
    });
    const { result } = renderHook(() => useWorkspace());
    const originalId = result.current.active.id;

    act(() => {
      result.current.update((workspace) => ({
        ...workspace,
        definitions: {
          ...workspace.definitions,
          savedIntent: "# intent",
          savedPreference: "",
          version: 1,
        },
        conversations: workspace.conversations.map((conversation) =>
          conversation.id === workspace.activeId
            ? { ...conversation, draft: "need a quiet mouse" }
            : conversation,
        ),
      }));
      result.current.send();
      result.current.newConversation();
    });

    await act(async () => {
      deferred.resolve(jsonResponse(createResponse, 202));
      await deferred.promise;
    });

    await waitFor(() => {
      const original = result.current.workspace.conversations.find(
        (conversation) => conversation.id === originalId,
      );
      expect(original?.requestId).toBe("req_demo_001");
      expect(result.current.workspace.activeId).not.toBe(originalId);
    });
    expect(postCalls(fetchMock)).toHaveLength(1);
  });

  it("can create a fresh request after only workspace storage was corrupt", async () => {
    sessionStorage.setItem(storageKey, "broken");
    const fetchMock = mockFetch((path, init) => {
      if (init?.method === "POST" && path === "/api/requests") {
        return jsonResponse(createResponse, 202);
      }

      return jsonResponse(fixture.snapshot);
    });

    const { result } = renderHook(() => useWorkspace());

    act(() => {
      result.current.update((workspace) => ({
        ...workspace,
        definitions: {
          ...workspace.definitions,
          savedIntent: "# intent",
          savedPreference: "",
          version: 1,
        },
        conversations: workspace.conversations.map((conversation) =>
          conversation.id === workspace.activeId
            ? { ...conversation, draft: "need a quiet mouse" }
            : conversation,
        ),
      }));
      result.current.send();
    });

    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(1));
    expect(result.current.error).not.toContain("待處理提交紀錄");
  });
  it("keeps the original pending key after a network failure across navigation and new conversation", async () => {
    sessionStorage.setItem(storageKey, JSON.stringify(workspaceWithRequest(null)));
    let postAttempts = 0;
    const fetchMock = mockFetch((path, init) => {
      if (init?.method === "POST" && path === "/api/requests") {
        postAttempts += 1;
        return postAttempts === 1
          ? Promise.reject(new TypeError("offline"))
          : jsonResponse(createResponse, 202);
      }

      return jsonResponse(fixture.snapshot);
    });

    const { result } = renderHook(() => useWorkspace());

    act(() => {
      result.current.patch("conv_1", { draft: "first mouse request" });
      result.current.send();
    });

    await waitFor(() => expect(result.current.unknown).toBe(true));
    const pendingAfterFailure = JSON.parse(sessionStorage.getItem(pendingKey) ?? "{}");

    act(() => {
      result.current.navigate("settings", null);
      result.current.newConversation();
      result.current.patch(result.current.active.id, { draft: "competing request" });
      result.current.send();
    });

    expect(postCalls(fetchMock)).toHaveLength(1);
    expect(JSON.parse(sessionStorage.getItem(pendingKey) ?? "{}").key).toBe(
      pendingAfterFailure.key,
    );

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(2));
    expect(postCalls(fetchMock)[1][1]?.headers).toEqual(postCalls(fetchMock)[0][1]?.headers);
    expect(postCalls(fetchMock)[1][1]?.body).toBe(postCalls(fetchMock)[0][1]?.body);
  });
});

describe("useWorkspace decision guards", () => {
  it("rejects unknown selected_offer_id snapshots at the client boundary", () => {
    const snapshot = {
      ...structuredClone(fixture.snapshot),
      status: "accepted",
      selected_offer_id: "unknown_offer",
    };

    expect(() => validateSnapshot(snapshot)).toThrow();
  });

  it("locks opposite actions after the first decision submit", async () => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify(workspaceWithRequest(validateSnapshot(structuredClone(fixture.snapshot)))),
    );

    const fetchMock = mockFetch((path, init) => {
      if (init?.method === "POST") {
        return jsonResponse(acceptResponse);
      }

      expect(path).toBe("/api/requests/req_demo_001");
      return jsonResponse(fixture.snapshot);
    });

    const { result } = renderHook(() => useWorkspace());

    await waitFor(() => expect(result.current.verified).toBe("req_demo_001"));

    act(() => {
      result.current.patch("conv_1", { feedback: "not this one" });
      result.current.accept("offer_a_r5");
      result.current.reject();
      result.current.accept("offer_b_r5");
    });

    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(1));
    expect(postCalls(fetchMock)[0][1]?.body).toBe(
      JSON.stringify({ action: "accept", offer_id: "offer_a_r5" }),
    );
  });

  it("keeps original feedback and starts exactly one refinement child after reject", async () => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify(workspaceWithRequest(validateSnapshot(structuredClone(fixture.snapshot)))),
    );

    let committed=false;
    const fetchMock = mockFetch((path, init) => {
      if(init?.method==='POST'&&path==='/api/requests')return new Promise<Response>(()=>{});
      if (init?.method === "POST") {
        committed=true;
        return jsonResponse(rejectResponse, 200);
      }

      expect(path).toBe("/api/requests/req_demo_001");
      return jsonResponse(committed?{...fixture.snapshot,status:'rejected',decision:rejectResponse}:fixture.snapshot);
    });

    const { result } = renderHook(() => useWorkspace());

    await waitFor(() => expect(result.current.verified).toBe("req_demo_001"));

    act(() => {
      result.current.patch("conv_1", { feedback: rejectResponse.feedback });
      result.current.reject();
    });

    await waitFor(() => {
      expect(result.current.active.snapshot?.status).toBe("rejected");
      expect(result.current.active.requestId).toBe("req_demo_001");
    });

    expect(result.current.active.message).toBe("quiet mouse");
    expect(result.current.active.feedbackHistory).toEqual([rejectResponse.feedback]);
    expect(result.current.active.snapshot?.decision).toEqual(rejectResponse);
    await waitFor(()=>expect(postCalls(fetchMock)).toHaveLength(2));
    expect(JSON.parse(String(postCalls(fetchMock)[1][1]?.body))).toEqual({intent_md:fixture.snapshot.documents.intent_md,preference_md:fixture.snapshot.documents.preference_md,refinement:{parent_request_id:'req_demo_001'}});
    expect(result.current.active.refinementRequested).toBe(false);
  });

  it("clears a reject HTTP 400 journal while preserving feedback and the published snapshot", async () => {
    const snapshot = validateSnapshot(structuredClone(fixture.snapshot));
    sessionStorage.setItem(storageKey, JSON.stringify(workspaceWithRequest(snapshot)));

    const fetchMock = mockFetch((path, init) => {
      if (init?.method === "POST") {
        return jsonResponse(
          { error: { code: "invalid_feedback", message: "Feedback was invalid", fields: [] } },
          400,
        );
      }

      expect(path).toBe("/api/requests/req_demo_001");
      return jsonResponse(fixture.snapshot);
    });

    const { result } = renderHook(() => useWorkspace());

    await waitFor(() => expect(result.current.verified).toBe("req_demo_001"));

    act(() => {
      result.current.patch("conv_1", { feedback: "still too expensive" });
      result.current.reject();
    });

    await waitFor(() => expect(result.current.error).toBe("Feedback was invalid"));

    expect(postCalls(fetchMock)).toHaveLength(1);
    expect(sessionStorage.getItem(pendingKey)).toBeNull();
    expect(result.current.active.feedback).toBe("still too expensive");
    expect(result.current.active.snapshot).toEqual(snapshot);
  });

  it("saves definitions atomically enough for a remounted hook to reuse them", () => {
    const first = renderHook(() => useWorkspace());

    act(() => {
      first.result.current.update((workspace) => ({
        ...workspace,
        definitions: {
          ...workspace.definitions,
          intent: "# saved intent",
          preference: "free pad only",
        },
      }));
      first.result.current.saveDefinitions();
    });

    first.unmount();
    const second = renderHook(() => useWorkspace());

    expect(second.result.current.workspace.definitions.savedIntent).toBe(
      "# saved intent",
    );
    expect(second.result.current.workspace.definitions.savedPreference).toBe(
      "free pad only",
    );
    expect(second.result.current.workspace.definitions.version).toBe(1);
  });
});

function Strict({ children }: { children: ReactNode }) {
  return createElement(StrictMode, null, children);
}

function mockFetch(
  handler: (path: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function postCalls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function workspaceWithRequest(snapshot: Workspace["conversations"][number]["snapshot"]): Workspace {
  return {
    definitions: {
      intent: "# intent",
      preference: "",
      savedIntent: "# intent",
      savedPreference: "",
      version: 1,
    },
    activeId: "conv_1",
    conversations: [
      {
        id: "conv_1",
        title: "quiet mouse",
        requestId: snapshot?.request_id ?? null,
        message: "quiet mouse",
        definitionVersion: 1,
        draft: "",
        feedback: "",
        feedbackHistory: [],
        skipped: [],
        snapshot,

      },
    ],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}
