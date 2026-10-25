"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { clerkKey } from "../providers";
import {
  readPendingChat,
  storePendingChat,
  clearPendingChat,
  createPendingChat,
  pendingMatchesScene,
  fetchPendingChatStatus,
  type PendingChat,
} from "../../lib/scene-chat-recovery";
import {
  Camera,
  Check,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Minus,
  Focus,
  Layers3,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Save,
  ScanEye,
  Search,
  Undo2,
  X,
  Box,
  PanelRightClose,
  MessageSquare,
  SlidersHorizontal,
  Upload,
  Film,
} from "lucide-react";
import PromptComposer from "./prompt-composer";
import CanvasDock from "./canvas-dock";
import ViewControls from "./view-controls";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { SidebarHeader } from "./studio-sidebar";
import SceneViewer, { type ViewerHandle } from "./scene-viewer";
import {
  applySceneChange,
  conceptWoodshed,
  sceneDocument,
  type SceneDocument,
} from "../../lib/scene-document";
import { sceneAgentReply } from "../../lib/scene-agent";
import { sceneChanges, retainedSceneHistory } from "../../lib/scene-changes";
import {
  nativeSceneAssets,
  nativeSceneTitles,
  type NativeSceneAsset,
} from "../../lib/scene-examples";
import type { StudioExampleId } from "../../lib/studio-examples";
import { usePageTools } from "../../lib/webmcp";

type Message = { role: "user" | "assistant"; text: string; changes?: "none" };
type Saved = { id: string; title: string; version: number; updatedAt: string };
type Isolation = { target: string; label: string; previous: Record<string, boolean> };
type AgentInfo = NonNullable<ReturnType<typeof sceneAgentReply.parse>["agent"]>;
type Proposal = { scene: SceneDocument; message: string; baseRevision: number; agent?: AgentInfo };
type Runtime = {
  available: boolean;
  mode: "local" | "hosted";
  token?: string;
  model?: string;
  reason?: string;
  nativeGeometry?: boolean;
};
const DRAFT = "blackblend.scene-draft.v1";
const initialMessage: Message = {
  role: "assistant",
  text: "The woodshed is ready to inspect. Select a part, peel the assembly apart, or tell me what you want to change.",
};
const pretty = (s: string) =>
  s.replace(/^Original shed · |^Woodshed · /, "").replace(/\.\d{3}$/, "");
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type WorkspaceProps = {
  onRender: (file: File, document: SceneDocument) => void;
  onImportAnimation: () => void;
  onViewExample: (id?: StudioExampleId) => void;
};
export default function SceneWorkspace(props: WorkspaceProps) {
  return clerkKey ? (
    <SignedInSceneWorkspace {...props} />
  ) : (
    <SceneWorkspaceCore {...props} authOwner={null} authSession={null} />
  );
}
function SignedInSceneWorkspace(props: WorkspaceProps) {
  const { isLoaded, userId, sessionId } = useAuth();
  return (
    <SceneWorkspaceCore
      key={isLoaded ? (userId ?? "guest") : "loading"}
      {...props}
      authOwner={isLoaded ? (userId ?? null) : null}
      authSession={sessionId ?? null}
    />
  );
}
function SceneWorkspaceCore({
  onRender,
  onImportAnimation,
  onViewExample,
  authOwner,
  authSession,
}: WorkspaceProps & { authOwner: string | null; authSession: string | null }) {
  const [scene, setScene] = useState<SceneDocument>(conceptWoodshed),
    [selected, setSelected] = useState<string | null>(null),
    [explode, setExplode] = useState(0),
    [playing, setPlaying] = useState(false),
    [progress, setProgress] = useState(0),
    [edges, setEdges] = useState(false),
    [xray, setXray] = useState(false),
    [navigation, setNavigation] = useState<"orbit" | "pan">("orbit"),
    [status, setStatus] = useState("Loading assembly…"),
    [error, setError] = useState(""),
    [prompt, setPrompt] = useState(""),
    [messages, setMessages] = useState<Message[]>([initialMessage]),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [previewProposal, setPreviewProposal] = useState(false),
    [lastAgent, setLastAgent] = useState<AgentInfo | null>(null),
    [runtime, setRuntime] = useState<Runtime>({ available: false, mode: "hosted" }),
    [pendingChat, setPendingChat] = useState<PendingChat | null>(null),
    [recoveryCheck, setRecoveryCheck] = useState(0),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState<number | null>(null),
    [image, setImage] = useState<string | null>(null),
    [imageName, setImageName] = useState(""),
    [saved, setSaved] = useState<Saved[]>([]),
    [saveStatus, setSaveStatus] = useState(""),
    [search, setSearch] = useState(""),
    [isolation, setIsolation] = useState<Isolation | null>(null),
    [ready, setReady] = useState(false),
    [sidebarOpen, setSidebarOpen] = useState(true),
    [sidebarTab, setSidebarTab] = useState<"parts" | "chat" | "scene">("parts");
  const viewer = useRef<ViewerHandle>(null),
    sceneRef = useRef(scene),
    history = useRef<SceneDocument[]>([]),
    future = useRef<SceneDocument[]>([]),
    savedRecord = useRef<{ id: string; version: number } | null>(null),
    lock = useRef(false),
    chatEnd = useRef<HTMLDivElement>(null),
    pendingRef = useRef<PendingChat | null>(null),
    completedPending = useRef<PendingChat | null>(null),
    flushDraft = useRef<() => void>(() => {}),
    alive = useRef(true),
    draftKey = useRef(DRAFT + ":" + (authOwner ?? "guest"));
  const [undoCount, setUndoCount] = useState(0),
    [redoCount, setRedoCount] = useState(0);
  useLayoutEffect(() => {
    sceneRef.current = scene;
  }, [scene]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 900px)");
    const adaptAssembly = () => {
      if (narrow.matches) setSidebarOpen(false);
    };
    const frame = requestAnimationFrame(adaptAssembly);
    narrow.addEventListener("change", adaptAssembly);
    return () => {
      cancelAnimationFrame(frame);
      narrow.removeEventListener("change", adaptAssembly);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let draft: SceneDocument | null = null;
      try {
        const response = await fetch("/api/scene-agent", { cache: "no-store" });
        const value = (await response.json()) as Runtime;
        const capabilities = {
          ...value,
          mode: value.token ? ("local" as const) : ("hosted" as const),
        };
        if (cancelled) return;
        setRuntime(capabilities);
        // Preserve the original local draft; hosted drafts are private to the active account.
        draftKey.current =
          capabilities.mode === "local" ? DRAFT : DRAFT + ":" + (authOwner ?? "guest");
      } catch {
        if (cancelled) return;
      }
      try {
        const raw = localStorage.getItem(draftKey.current);
        if (raw) {
          const stored = JSON.parse(raw);
          draft = sceneDocument.parse(stored.scene ?? stored);
          history.current = retainedSceneHistory(stored.undo);
          future.current = retainedSceneHistory(stored.redo);
          setUndoCount(history.current.length);
          setRedoCount(future.current.length);
          if (
            stored.record &&
            /^[a-f0-9-]{36}$/.test(stored.record.id) &&
            Number.isInteger(stored.record.version)
          )
            savedRecord.current = stored.record;
          if (Array.isArray(stored.messages))
            setMessages(
              stored.messages
                .filter(
                  (m: Message) =>
                    ["user", "assistant"].includes(m.role) && typeof m.text === "string",
                )
                .slice(-40),
            );
        }
      } catch {}
      if (draft) {
        if (!cancelled) {
          setScene(draft);
          setReady(true);
        }
        return;
      }
      try {
        const r = await fetch("/api/scene-example?kind=document");
        if (r.ok) {
          const doc = sceneDocument.parse(await r.json());
          if (!cancelled) setScene(doc);
        }
      } catch {}
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authOwner]);
  useEffect(() => {
    if (ready) {
      const id = setTimeout(() => {
        try {
          localStorage.setItem(
            draftKey.current,
            JSON.stringify({
              scene,
              record: savedRecord.current,
              messages: messages.slice(-40),
              undo: retainedSceneHistory(history.current),
              redo: retainedSceneHistory(future.current),
            }),
          );
        } catch {}
      }, 300);
      return () => clearTimeout(id);
    }
  }, [scene, ready, messages, saveStatus]);
  useLayoutEffect(() => {
    if (!ready) return;
    flushDraft.current = () => {
      try {
        localStorage.setItem(
          draftKey.current,
          JSON.stringify({
            scene,
            record: savedRecord.current,
            messages: messages.slice(-40),
            undo: retainedSceneHistory(history.current),
            redo: retainedSceneHistory(future.current),
          }),
        );
      } catch {}
    };
  }, [scene, ready, messages, saveStatus]);
  useEffect(() => {
    const flush = () => flushDraft.current();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  useEffect(() => {
    if (sidebarOpen && sidebarTab === "chat") {
      chatEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [messages, proposal, busy, sidebarOpen, sidebarTab]);
  const refreshSaved = useCallback(async () => {
    const r = await fetch("/api/scenes");
    if (r.ok) {
      const data = (await r.json()) as { scenes: Saved[] };
      setSaved(data.scenes);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/scene-agent", { cache: "no-store" }).then((r) => r.json() as Promise<Runtime>),
      fetch("/api/scenes", { cache: "no-store" }).then(async (r) =>
        r.ok ? ((await r.json()) as { scenes: Saved[] }).scenes : [],
      ),
    ])
      .then(([capabilities, scenes]) => {
        if (cancelled) return;
        setRuntime({ ...capabilities, mode: capabilities.token ? "local" : "hosted" });
        setSaved(scenes as Saved[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authOwner, authSession]);
  function forgetPending(pending: PendingChat) {
    try {
      clearPendingChat(sessionStorage, pending);
    } catch {}
    if (pendingRef.current?.requestId !== pending.requestId) return;
    pendingRef.current = null;
    setPendingChat(null);
  }
  async function acceptReply(raw: unknown, pending: PendingChat | null, source: SceneDocument) {
    if (!alive.current) return;
    const validated = sceneAgentReply.safeParse(raw);
    if (!validated.success) {
      if (pending) forgetPending(pending);
      setProposal(null);
      setError(
        "The saved response was not a valid scene proposal. No changes applied and no automatic retry was made.",
      );
      return;
    }
    const reply = validated.data;
    const matches = pending
      ? !!authOwner && (await pendingMatchesScene(pending, authOwner, sceneRef.current))
      : sceneRef.current.revision === source.revision;
    if (!alive.current || (pending && pendingRef.current?.requestId !== pending.requestId)) return;
    if (pending) {
      pendingRef.current = null;
      setPendingChat(null);
    }
    if (!matches || reply.scene.revision !== source.revision) {
      if (pending) {
        try {
          clearPendingChat(sessionStorage, pending);
        } catch {}
      }
      setProposal(null);
      setError(
        "The scene changed while this proposal was processing. Its edits were not applied. No request was repeated.",
      );
      return;
    }
    completedPending.current = pending;
    setError("");
    const changed = sceneChanges(sceneRef.current, reply.scene).changed;
    if (changed) setProposal({ ...reply, baseRevision: source.revision });
    else discardSavedProposal();
    setPreviewProposal(false);
    setLastAgent(reply.agent ?? null);
    setMessages((m) => [
      ...m,
      { role: "assistant", text: reply.message, ...(changed ? {} : { changes: "none" as const }) },
    ]);
  }
  useEffect(() => {
    if (!ready || runtime.mode !== "hosted" || !authOwner) return;
    const frame = requestAnimationFrame(() => {
      try {
        const pending = readPendingChat(sessionStorage, authOwner);
        if (pending) {
          pendingRef.current = pending;
          setPendingChat(pending);
        }
      } catch {}
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, runtime.mode, authOwner]);
  useEffect(() => {
    if (!ready || runtime.mode !== "hosted" || !pendingChat || pendingChat.owner !== authOwner)
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const pending = pendingChat;
    const check = async () => {
      try {
        const response = await fetchPendingChatStatus(pending);
        const result = (await response.json()) as {
          status?: string;
          error?: string;
          reply?: unknown;
        };
        if (cancelled || !alive.current || pendingRef.current?.requestId !== pending.requestId)
          return;
        if (response.ok && result.status === "completed") {
          await acceptReply(result.reply, pending, {
            ...sceneRef.current,
            revision: pending.baseRevision,
          });
          return;
        }
        if (response.ok && result.status && result.status !== "pending") {
          forgetPending(pending);
          setProposal(null);
          setError(
            result.error ??
              "The previous request did not produce a confirmed proposal. No automatic retry was made.",
          );
          return;
        }
        if (Date.now() - pending.createdAt > 12 * 60 * 1000 && (!response.ok || !result.status)) {
          forgetPending(pending);
          setProposal(null);
          setError("The previous request could not be confirmed. No automatic retry was made.");
          return;
        }
        if (!busy)
          setError("Checking the existing scene request. No new request will be submitted.");
      } catch {
        if (!cancelled)
          setError(
            "The scene request is unconfirmed. Checking its saved status; no request will be repeated.",
          );
      }
      if (!cancelled)
        timer = setTimeout(() => {
          void check();
        }, 3000);
    };
    // Let the initial POST save its job record before checking status.
    timer = setTimeout(
      () => {
        void check();
      },
      recoveryCheck ? 0 : 3000,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Recover only this account's request. Check for scene/camera changes when its reply arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, runtime.mode, pendingChat, authOwner, recoveryCheck, busy]);
  function discardSavedProposal() {
    if (completedPending.current) {
      try {
        clearPendingChat(sessionStorage, completedPending.current);
      } catch {}
      completedPending.current = null;
    }
    setProposal(null);
    setPreviewProposal(false);
  }
  function commit(next: SceneDocument, preservePose = false) {
    if (!sceneChanges(sceneRef.current, next).changed) return;
    if (
      next.asset !== sceneRef.current.asset ||
      next.parts.some((p) => {
        const prior = sceneRef.current.parts.find((previous) => previous.id === p.id);
        return prior && prior.visible !== p.visible;
      })
    )
      setIsolation(null);
    discardSavedProposal();
    history.current.push(sceneRef.current);
    if (history.current.length > 30) history.current.shift();
    future.current = [];
    setUndoCount(history.current.length);
    setRedoCount(0);
    const doc = sceneDocument.parse({
      ...next,
      revision: sceneRef.current.revision + 1,
    });
    sceneRef.current = doc;
    setScene(doc);
    setProposal(null);
    setPlaying(false);
    if (!preservePose) setProgress(0);
    setSaveStatus("");
  }
  function updatePart(id: string, patch: Record<string, unknown>) {
    commit(
      applySceneChange(sceneRef.current, {
        baseRevision: sceneRef.current.revision,
        message: "Manual edit",
        assumptions: [],
        operations: [{ type: "update_part", id, patch }],
      }),
    );
  }
  function settings(patch: Partial<SceneDocument>, preservePose = false) {
    commit({ ...sceneRef.current, ...patch }, preservePose);
  }
  function setVisibility(visible: (part: SceneDocument["parts"][number]) => boolean) {
    setIsolation(null);
    const source = sceneRef.current;
    const parts = source.parts.map((p) => ({ ...p, visible: visible(p) }));
    if (parts.some((p, i) => p.visible !== source.parts[i].visible)) {
      commit({ ...source, parts });
    }
  }
  function exitIsolation() {
    if (!isolation) return;
    const previous = isolation.previous;
    setVisibility((p) => previous[p.id] ?? p.visible);
  }
  function isolate(
    target: string,
    label: string,
    visible: (part: SceneDocument["parts"][number]) => boolean,
  ) {
    if (isolation?.target === target) {
      exitIsolation();
      return;
    }
    const previous =
      isolation?.previous ??
      Object.fromEntries(sceneRef.current.parts.map((p) => [p.id, p.visible]));
    setVisibility(visible);
    setIsolation({ target, label, previous });
  }
  function undo(redo = false) {
    setIsolation(null);
    discardSavedProposal();
    const from = redo ? future.current : history.current,
      to = redo ? history.current : future.current;
    const prior = from.pop();
    if (!prior) return;
    to.push(sceneRef.current);
    setUndoCount(history.current.length);
    setRedoCount(future.current.length);
    const next = { ...prior, revision: sceneRef.current.revision + 1 };
    sceneRef.current = next;
    setScene(next);
    setProposal(null);
    setPlaying(false);
    setProgress(0);
  }
  async function reset(
    asset: NativeSceneAsset = scene.asset === "primitives" ? "woodshed" : scene.asset,
  ) {
    if (lock.current) return;
    lock.current = true;
    setError("");
    try {
      const r = await fetch("/api/scene-example?kind=document&asset=" + asset);
      if (!r.ok && asset !== "woodshed")
        throw Error(
          "This example's private model is not available on this host. Its video is available in Finish.",
        );
      const document = r.ok ? sceneDocument.parse(await r.json()) : conceptWoodshed();
      setIsolation(null);
      commit(document);
      savedRecord.current = null;
      setMessages([
        {
          role: "assistant",
          text:
            document.title +
            " is ready to inspect. Select an assembly, adjust motion, or describe an edit.",
        },
      ]);
      setSelected(null);
      setExplode(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the example.");
    } finally {
      lock.current = false;
    }
  }
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setSaveStatus("Saving…");
    setError("");
    try {
      const record = savedRecord.current ?? {
        id: crypto.randomUUID(),
        version: 0,
      };
      savedRecord.current = record;
      const res = await fetch("/api/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: record.id,
          expectedVersion: record.version,
          document: sceneRef.current,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        scene: { id: string; version: number };
      };
      if (res.status === 401)
        throw Error(
          "Sign in from the account menu to save privately. Your draft is retained in this browser.",
        );
      if (!res.ok) throw Error(data.error ?? "Could not save scene.");
      savedRecord.current = { id: data.scene.id, version: data.scene.version };
      setSaveStatus("Saved");
      await refreshSaved();
    } catch (e) {
      setSaveStatus("");
      setError(e instanceof Error ? e.message : "Could not save scene.");
    } finally {
      lock.current = false;
    }
  }
  async function openSaved(id: string) {
    if (lock.current) return;
    setError("");
    try {
      const r = await fetch("/api/scenes?id=" + encodeURIComponent(id));
      const data = (await r.json()) as {
        error?: string;
        scene: { id: string; version: number; document: unknown };
      };
      if (!r.ok) throw Error(data.error);
      setIsolation(null);
      commit(sceneDocument.parse(data.scene.document));
      savedRecord.current = { id: data.scene.id, version: data.scene.version };
      setSaveStatus("Saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open scene.");
    }
  }
  async function attachPhoto(file?: File) {
    if (!file) return;
    if (file.size > 5_500_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG or WebP under 5.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result));
      setImageName(file.name);
      setError("");
    };
    reader.readAsDataURL(file);
  }
  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (!prompt.trim() || lock.current || pendingRef.current) return;
    const text = prompt.trim();
    setSidebarOpen(true);
    setSidebarTab("chat");
    setError("");
    if (!runtime.available) {
      setMessages((m) => [
        ...m,
        { role: "user", text },
        {
          role: "assistant",
          text:
            runtime.reason ??
            "The agent is not connected on this host. You can edit the scene directly, or use the connected Codex page tools to propose changes.",
        },
      ]);
      setPrompt("");
      return;
    }
    lock.current = true;
    setBusy(true);
    discardSavedProposal();
    setPrompt("");
    setMessages((m) => [...m, { role: "user", text }]);
    const source = structuredClone(sceneRef.current);
    let pending: PendingChat | null = null;
    let submitted = false;
    try {
      const requestId = crypto.randomUUID();
      if (runtime.mode === "hosted") {
        if (!authOwner) throw Error("Sign in to use the hosted scene agent.");
        pending = await createPendingChat(authOwner, source, requestId);
        if (!alive.current) return;
        // Save the request ID and scene draft before making the one allowed POST.
        localStorage.setItem(
          draftKey.current,
          JSON.stringify({
            scene: source,
            record: savedRecord.current,
            messages: [...messages, { role: "user", text }].slice(-40),
            undo: retainedSceneHistory(history.current),
            redo: retainedSceneHistory(future.current),
          }),
        );
        storePendingChat(sessionStorage, pending);
        pendingRef.current = pending;
        setPendingChat(pending);
      }
      if (!alive.current) return;
      submitted = true;
      const res = await fetch("/api/scene-agent", {
        method: "POST",
        signal: AbortSignal.timeout(
          runtime.mode === "hosted" && runtime.nativeGeometry ? 330000 : 210000,
        ),
        headers: {
          "Content-Type": "application/json",
          "X-Scene-Token": runtime.token ?? "",
        },
        body: JSON.stringify({
          requestId,
          prompt: text,
          scene: source,
          selectedPartId: selected,
          history: messages.slice(-8).map((m) => ({ ...m, text: m.text.slice(0, 3000) })),
          ...(image ? { image } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw Error(data.error ?? "The agent request failed.");
      await acceptReply(data, pending, source);
    } catch (e) {
      if (
        !alive.current ||
        (pending && submitted && pendingRef.current?.requestId !== pending.requestId)
      )
        return;
      setError(
        pending && submitted
          ? "The request outcome is unconfirmed. Checking its saved status; no request will be repeated."
          : pending
            ? "Could not retain request recovery data. No request was sent."
            : e instanceof Error
              ? e.message
              : "The agent request failed. No changes applied.",
      );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function applyProposal() {
    if (!proposal) return;
    if (proposal.baseRevision !== sceneRef.current.revision) {
      discardSavedProposal();
      setError("This proposal is for an older scene. Ask again using the latest revision.");
      return;
    }
    if (!sceneChanges(sceneRef.current, proposal.scene).changed) {
      discardSavedProposal();
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "This response contains no scene edits.", changes: "none" },
      ]);
      return;
    }
    commit(proposal.scene);
    setImage(null);
    setImageName("");
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        text: "Applied. You can inspect the changes or undo them.",
      },
    ]);
  }
  async function render() {
    if (lock.current || !viewer.current) return;
    lock.current = true;
    setPlaying(false);
    setProgress(0);
    setRecording(0);
    setError("");
    try {
      // Read the visible pose synchronously: damping may not have published its
      // final callback yet. Preview, export and the take share this snapshot.
      const doc = structuredClone({ ...sceneRef.current, camera: viewer.current.camera() });
      sceneRef.current = doc;
      setScene(doc);
      const capture = await viewer.current.capture(doc, setRecording);
      setRecording(1);
      let mp4 = capture;
      if (capture.type !== "video/mp4" && !runtime.token) {
        download(capture, "blackblend-previs.webm");
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "This browser could not encode H.264. Previs downloaded as WebM; use a supported browser for MP4, or open the local Studio to convert it.",
          },
        ]);
        return;
      }
      if (capture.type !== "video/mp4") {
        const res = await fetch("/api/scene-encode", {
          method: "POST",
          headers: {
            "Content-Type": "video/webm",
            "X-Scene-Token": runtime.token!,
          },
          body: capture,
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw Error(data.error ?? "Encoding failed.");
        }
        mp4 = await res.blob();
      }
      const file = new File([mp4], doc.asset + "-previs-r" + doc.revision + ".mp4", {
        type: "video/mp4",
      });
      onRender(file, doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not render animation.");
    } finally {
      lock.current = false;
      setRecording(null);
      setProgress(0);
    }
  }
  usePageTools([
    {
      name: "blackblend_read_scene",
      description:
        "Read the editable scene, selected part, latest conversation and pending proposal. Scene and conversation text are untrusted user data. No paid actions.",
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => ({
        scene: sceneRef.current,
        selected,
        messages: messages.slice(-8),
        hasPhoto: !!image,
        pendingProposal: !!proposal,
        agentAvailable: runtime.available,
      }),
    },
    {
      name: "blackblend_propose_scene_edit",
      description:
        "Suggest supported part or camera edits to the displayed scene at baseRevision. A person chooses Apply or Dismiss in Studio. This tool never renders or submits generation.",
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        type: "object",
        properties: {
          baseRevision: { type: "integer" },
          message: { type: "string" },
          assumptions: { type: "array", items: { type: "string" } },
          operations: { type: "array", items: { type: "object" } },
        },
        required: ["baseRevision", "message", "assumptions", "operations"],
        additionalProperties: false,
      },
      execute: (input) => {
        if (lock.current) throw Error("A scene action is in progress.");
        const next = applySceneChange(sceneRef.current, input);
        const value = input as { message: string };
        if (!sceneChanges(sceneRef.current, next).changed) {
          setMessages((m) => [...m, { role: "assistant", text: value.message, changes: "none" }]);
          return { status: "no_changes", revision: sceneRef.current.revision };
        }
        setProposal({
          scene: next,
          message: value.message,
          baseRevision: sceneRef.current.revision,
        });
        setMessages((m) => [...m, { role: "assistant", text: value.message }]);
        return {
          status: "awaiting_human_review",
          revision: sceneRef.current.revision,
        };
      },
    },
  ]);
  const part = scene.parts.find((p) => p.id === selected);
  const groups = [...new Set(scene.parts.map((p) => p.group))];
  const hiddenCount = scene.parts.filter((p) => !p.visible).length;
  const partQuery = search.trim().toLowerCase();
  const proposalChanges = proposal ? sceneChanges(scene, proposal.scene) : null;
  const frozen = busy || recording !== null || previewProposal;
  return (
    <main className="scene-workspace">
      <div className="scene-topbar">
        <div>
          <span className="scene-project-icon">
            <Box size={17} />
          </span>
          <div>
            <h1>{scene.title}</h1>
            <span>
              01 / ANIMATE ·{" "}
              {scene.fidelity === "source-derived" ? "BLENDER SOURCE" : "CONCEPT MODEL"} <i /> REV{" "}
              {String(scene.revision).padStart(2, "0")}
            </span>
          </div>
        </div>
        <div className="scene-source-actions">
          <Popover>
            <PopoverTrigger asChild>
              <button className="scene-secondary" title="Start with…" disabled={frozen}>
                <Upload size={14} /> Start with…
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              className="studio-popover source-entry-menu"
              aria-label="Choose a starting point"
            >
              <h2>Start with what you have.</h2>
              <p>Open an example model or use an animation you have rendered.</p>
              {nativeSceneAssets.map((asset) => (
                <button key={asset} disabled={frozen} onClick={() => void reset(asset)}>
                  <Box size={16} />
                  <span>
                    {nativeSceneTitles[asset]}
                    <small>Editable assembly model</small>
                  </span>
                </button>
              ))}
              <button disabled={frozen} onClick={onImportAnimation}>
                <Upload size={16} />
                <span>
                  Import Blender animation<small>Use an MP4 you have already rendered.</small>
                </span>
              </button>
              <button
                disabled={frozen}
                onClick={() =>
                  onViewExample(scene.asset === "primitives" ? "woodshed" : scene.asset)
                }
              >
                <Film size={16} />
                <span>
                  Watch the finished example<small>Compare an existing take. No generation.</small>
                </span>
              </button>
              <small>
                Other models currently need a prepared Blackblend scene export. General CAD import
                and model creation are on the roadmap.
              </small>
            </PopoverContent>
          </Popover>
          {!sidebarOpen && (
            <button
              className="scene-secondary scene-open-sidebar"
              aria-label="Open studio sidebar"
              aria-expanded={false}
              aria-controls="scene-sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelRightClose size={15} /> Studio
            </button>
          )}
        </div>
      </div>
      <div className={"scene-grid scene-sidebar-layout" + (!sidebarOpen ? " sidebar-closed" : "")}>
        <section className="scene-stage" aria-label="3D assembly workspace">
          <div className="scene-stage-label">
            <span className="scene-status-dot" />
            {previewProposal ? "Preview · not applied · " : ""}
            {status}
          </div>
          {ready && (
            <SceneViewer
              ref={viewer}
              document={previewProposal && proposal ? proposal.scene : scene}
              selected={selected}
              explode={explode}
              playing={playing}
              locked={frozen}
              progress={progress}
              edges={edges}
              navigation={navigation}
              xray={xray}
              onSelect={setSelected}
              onProgress={setProgress}
              onEnded={() => setPlaying(false)}
              onStatus={setStatus}
              onCamera={(camera) => {
                if (
                  !lock.current &&
                  !previewProposal &&
                  JSON.stringify(camera) !== JSON.stringify(sceneRef.current.camera)
                ) {
                  const next = { ...sceneRef.current, camera };
                  sceneRef.current = next;
                  setScene(next);
                }
              }}
            />
          )}
          <div className="scene-view-tools">
            <ViewControls
              camera={scene.camera}
              navigation={navigation}
              onNavigation={setNavigation}
              onChange={(camera) => settings({ camera }, true)}
              onView={(view) => viewer.current?.view(view)}
              onReset={() => viewer.current?.resetView()}
              onFitAnimation={() => {
                try {
                  viewer.current?.fitAnimation();
                  setError("");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not fit animation.");
                }
              }}
              renderStyle={scene.renderStyle ?? "material"}
              onRenderStyle={(renderStyle) => settings({ renderStyle }, true)}
              onFrame={(selection) =>
                viewer.current?.focus(selection ? (selected ?? undefined) : undefined)
              }
              selected={!!part?.visible}
              disabled={frozen || playing}
            />
            <button
              title={isolation ? "Exit isolate" : "Isolate selected part"}
              aria-label={isolation ? "Exit isolate" : "Isolate selected part"}
              aria-pressed={!!isolation}
              disabled={frozen || (!part && !isolation)}
              onClick={() =>
                isolation
                  ? exitIsolation()
                  : part && isolate(`part:${part.id}`, pretty(part.name), (p) => p.id === part.id)
              }
            >
              <ScanEye size={16} />
            </button>
            <button
              title={selected ? "Frame selection · F" : "Frame all · Home"}
              aria-label={selected ? "Frame selection" : "Frame all"}
              disabled={frozen || (!!part && !part.visible)}
              onClick={() => viewer.current?.focus(selected ?? undefined)}
            >
              <Focus size={16} />
            </button>
            <button
              aria-label="Toggle edges"
              title={
                scene.renderStyle === "wireframe" ? "Wireframe includes feature edges" : "Edges"
              }
              disabled={scene.renderStyle === "wireframe"}
              aria-pressed={scene.renderStyle === "wireframe" || edges}
              onClick={() => setEdges(!edges)}
            >
              <Layers3 size={16} />
            </button>
            <button
              aria-label={scene.renderStyle === "wireframe" ? "Show hidden edges" : "Toggle x-ray"}
              title={scene.renderStyle === "wireframe" ? "Show hidden edges" : "X-ray"}
              aria-pressed={xray}
              onClick={() => setXray(!xray)}
            >
              <Box size={16} />
            </button>
            <button
              aria-label="Save viewport image"
              onClick={() => {
                const data = viewer.current?.screenshot();
                if (data) {
                  const a = document.createElement("a");
                  a.href = data;
                  a.download = scene.asset + "-viewport.png";
                  a.click();
                }
              }}
            >
              <Camera size={16} />
            </button>
          </div>
          <div className="scene-stage-hint">
            DRAG TO ORBIT <span>·</span> SCROLL TO ZOOM <span>·</span> CLICK TO INSPECT
          </div>
          <CanvasDock className="canvas-dock" label="Scene composer">
            {proposal && (
              <button
                className="canvas-proposal-notice"
                onClick={() => {
                  setSidebarOpen(true);
                  setSidebarTab("chat");
                }}
              >
                <Eye size={14} /> Scene changes ready to review
              </button>
            )}
            <div className="scene-playback">
              <div className="scene-timeline">
                <button
                  aria-label={playing ? "Pause animation" : "Play animation"}
                  disabled={frozen}
                  onClick={() => {
                    if (!playing && progress >= 1) setProgress(0);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <input
                  aria-label="Animation timeline"
                  type="range"
                  min="0"
                  max="1"
                  step=".001"
                  value={progress}
                  disabled={frozen}
                  onChange={(e) => {
                    setPlaying(false);
                    setProgress(Number(e.target.value));
                  }}
                />
                <span>
                  {(progress * scene.animation.duration).toFixed(1)} / {scene.animation.duration}s
                </span>
              </div>
            </div>
            <div className="scene-prompt-area">
              <PromptComposer
                label="Message the scene agent"
                placeholder={image ? "Describe this photo…" : "Ask Blackblend…"}
                value={prompt}
                onChange={setPrompt}
                maxLength={6000}
                onSubmit={() => void send()}
                submitLabel="Send message to agent"
                disabled={frozen}
                busy={busy}
                submitDisabled={!!pendingChat}
                enterToSend
                context={
                  part ? (
                    <button
                      className="composer-part"
                      onClick={() => setSelected(null)}
                      title="Clear part selection"
                    >
                      <Box size={12} />
                      <span>{pretty(part.name)}</span>
                      <X size={12} />
                    </button>
                  ) : undefined
                }
                attachment={
                  image
                    ? {
                        src: image,
                        name: imageName,
                        remove: () => {
                          setImage(null);
                          setImageName("");
                        },
                      }
                    : undefined
                }
                onAttach={(file) => void attachPhoto(file)}
                suggestions={[
                  scene.asset === "massey-harris-21"
                    ? "Lift the separator assembly"
                    : scene.asset === "ptz"
                      ? "Lift the payload plate"
                      : runtime.nativeGeometry
                        ? "Cut a real window in the rear wall"
                        : "Lift the roof layers",
                  "A slow 360° orbit",
                  "Use a white background",
                ]}
              />
            </div>
          </CanvasDock>
        </section>
        <aside
          id="scene-sidebar"
          className="scene-sidebar"
          aria-label="Studio sidebar"
          inert={!sidebarOpen}
        >
          <SidebarHeader
            id="scene-sidebar"
            tabs={[
              { id: "parts", label: "Parts", icon: Box },
              { id: "chat", label: "Chat", icon: MessageSquare, badge: !!proposal },
              { id: "scene", label: "Scene", icon: SlidersHorizontal },
            ]}
            active={sidebarTab}
            onSelect={(id) => setSidebarTab(id as "parts" | "chat" | "scene")}
            onClose={() => setSidebarOpen(false)}
          />
          <div
            id="scene-sidebar-panel-parts"
            role="tabpanel"
            aria-labelledby="scene-sidebar-tab-parts"
            hidden={sidebarTab !== "parts"}
            className="scene-sidebar-panel scene-sidebar-parts"
            tabIndex={0}
          >
            <div className="scene-search">
              <Search size={14} aria-hidden="true" />
              <input
                aria-label="Find a part"
                placeholder="Find a part…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" aria-label="Clear part search" onClick={() => setSearch("")}>
                  <X size={13} />
                </button>
              )}
            </div>
            {isolation ? (
              <div className="scene-isolation-status" role="status">
                <span>
                  <ScanEye size={13} />
                  <span>Isolated · {isolation.label}</span>
                </span>
                <button disabled={frozen} onClick={exitIsolation}>
                  Exit isolate
                </button>
              </div>
            ) : (
              hiddenCount > 0 && (
                <div className="scene-visibility-reset">
                  <span>{hiddenCount} hidden</span>
                  <button disabled={frozen} onClick={() => setVisibility(() => true)}>
                    <Eye size={13} /> Show all
                  </button>
                </div>
              )
            )}
            <div className="scene-parts">
              {groups.map((group) => {
                const members = scene.parts.filter((p) => p.group === group);
                const matches = members.filter(
                  (p) =>
                    group.toLowerCase().includes(partQuery) ||
                    p.name.toLowerCase().includes(partQuery),
                );
                if (!matches.length) return null;
                const visibleCount = members.filter((p) => p.visible).length;
                const visibility =
                  visibleCount === 0
                    ? "hidden"
                    : visibleCount === members.length
                      ? "visible"
                      : "mixed";
                return (
                  <details
                    key={group}
                    open
                    className="scene-assembly-group"
                    data-visibility={visibility}
                  >
                    <summary>
                      <ChevronDown size={12} className="scene-group-chevron" />
                      <span className="scene-group-name">{group}</span>
                      <span
                        className="scene-group-count"
                        aria-label={`${visibleCount} of ${members.length} visible`}
                      >
                        {visibleCount === members.length
                          ? members.length
                          : `${visibleCount}/${members.length}`}
                      </span>
                      <button
                        className="scene-group-isolate scene-part-eye"
                        aria-label={`Isolate ${group}`}
                        aria-pressed={isolation?.target === `group:${group}`}
                        title={`Show only ${group}`}
                        disabled={frozen}
                        onClick={(e) => {
                          e.preventDefault();
                          isolate(`group:${group}`, group, (p) => p.group === group);
                        }}
                      >
                        <ScanEye size={13} />
                      </button>
                      <button
                        className="scene-group-eye scene-part-eye"
                        aria-label={`${visibleCount ? "Hide" : "Show"} ${group} section`}
                        title={`${visibleCount} of ${members.length} visible · ${visibleCount ? "Hide" : "Show"} entire section`}
                        disabled={frozen}
                        onClick={(e) => {
                          e.preventDefault();
                          setVisibility((p) =>
                            p.group === group ? visibleCount === 0 : p.visible,
                          );
                        }}
                      >
                        {visibility === "hidden" ? (
                          <EyeOff size={13} />
                        ) : visibility === "mixed" ? (
                          <Minus size={13} />
                        ) : (
                          <Eye size={13} />
                        )}
                      </button>
                    </summary>
                    {matches.map((p) => (
                      <div
                        className={
                          "scene-part-row" +
                          (selected === p.id ? " selected" : "") +
                          (!p.visible ? " is-hidden" : "")
                        }
                        key={p.id}
                      >
                        <button
                          className="scene-part-name"
                          disabled={frozen}
                          onClick={() => setSelected(p.id)}
                        >
                          <span className="scene-part-swatch" style={{ background: p.color }} />
                          {pretty(p.name)}
                        </button>
                        <button
                          className="scene-part-isolate scene-part-eye"
                          aria-label={`Isolate part ${p.name}`}
                          aria-pressed={isolation?.target === `part:${p.id}`}
                          title={`Isolate ${pretty(p.name)}`}
                          disabled={frozen}
                          onClick={() => {
                            setSelected(p.id);
                            isolate(`part:${p.id}`, pretty(p.name), (member) => member.id === p.id);
                          }}
                        >
                          <ScanEye size={13} />
                        </button>
                        <button
                          className="scene-part-eye"
                          aria-label={(p.visible ? "Hide " : "Show ") + p.name}
                          disabled={frozen}
                          onClick={() => updatePart(p.id, { visible: !p.visible })}
                        >
                          {p.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                      </div>
                    ))}
                  </details>
                );
              })}
              {partQuery &&
                !scene.parts.some(
                  (p) =>
                    p.group.toLowerCase().includes(partQuery) ||
                    p.name.toLowerCase().includes(partQuery),
                ) && <p className="scene-parts-empty">No matching parts</p>}
            </div>
            <div className="scene-tree-footer">
              <details className="scene-files">
                <summary>
                  Scene files <ChevronDown size={14} />
                </summary>
                <div className="scene-files-body">
                  {saved.length > 0 && (
                    <label>
                      Saved scenes
                      <select
                        aria-label="Open saved scene"
                        value=""
                        onChange={(e) => void openSaved(e.target.value)}
                      >
                        <option value="">Open a scene…</option>
                        {saved.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button onClick={() => void reset()} disabled={frozen}>
                    <RotateCcw size={13} /> Reload{" "}
                    {scene.asset === "primitives" ? "woodshed" : nativeSceneTitles[scene.asset]}
                  </button>
                  <button
                    onClick={() =>
                      download(
                        new Blob([JSON.stringify(scene, null, 2)], {
                          type: "application/json",
                        }),
                        "blackblend-scene.json",
                      )
                    }
                  >
                    <Download size={13} /> Scene document
                  </button>
                  {scene.geometry && (
                    <a href={`/api/scene-geometry?kind=blend&id=${scene.geometry.id}`} download>
                      <Download size={13} /> Native .blend
                    </a>
                  )}
                  <label className="scene-import">
                    Import scene
                    <input
                      type="file"
                      accept=".json,application/json"
                      disabled={frozen}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          if (file.size > 250000) throw Error("Scene file is too large.");
                          setIsolation(null);
                          commit(sceneDocument.parse(JSON.parse(await file.text())));
                          savedRecord.current = null;
                        } catch {
                          setError("Choose a valid Blackblend scene document under 250 KB.");
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </details>
            </div>
          </div>
          <div
            id="scene-sidebar-panel-chat"
            role="tabpanel"
            aria-labelledby="scene-sidebar-tab-chat"
            hidden={sidebarTab !== "chat"}
            className="scene-sidebar-panel scene-sidebar-chat"
            tabIndex={0}
          >
            <div className="scene-chat">
              <div className="scene-chat-kicker">
                <span className="scene-mini-mark">b.</span>
                <span>
                  {runtime.model === "gpt-6.1-sol" ? "Sol · scene director" : "Scene agent"}
                </span>
              </div>
              {messages.map((message, index) => (
                <div className={"scene-message " + message.role} key={index}>
                  {message.role === "assistant" && (
                    <span className="scene-message-author">Blackblend</span>
                  )}
                  <p>{message.text}</p>
                  {message.changes === "none" && (
                    <span className="scene-message-status">No scene changes</span>
                  )}
                </div>
              ))}
              {(busy || pendingChat) && (
                <div className="scene-thinking">
                  <LoaderCircle size={13} className="scene-spin" />
                  {busy ? "Working on a proposal…" : "Checking the existing request…"}
                  {pendingChat && (
                    <button
                      type="button"
                      className="scene-icon-button"
                      disabled={busy}
                      onClick={() => setRecoveryCheck((n) => n + 1)}
                    >
                      Refresh status
                    </button>
                  )}
                </div>
              )}
              {lastAgent && (
                <details className="scene-agent-receipt">
                  <summary>
                    {lastAgent.model} ·{" "}
                    {(lastAgent.inputTokens + lastAgent.outputTokens).toLocaleString()} tokens
                  </summary>
                  {lastAgent.actions.map((action, i) => (
                    <p key={i}>{action}</p>
                  ))}
                  <a href="https://platform.openai.com/traces" target="_blank" rel="noreferrer">
                    Open traces
                  </a>
                  <small>{lastAgent.traceId}</small>
                </details>
              )}
              {proposal && (
                <div className="scene-proposal">
                  <span>SCENE PROPOSAL</span>
                  <p>
                    {proposalChanges?.geometry ? "Native geometry updated · " : ""}
                    {proposalChanges?.added.length
                      ? `${proposalChanges.added.length} added · `
                      : ""}
                    {proposalChanges?.removed.length
                      ? `${proposalChanges.removed.length} removed · `
                      : ""}
                    {proposalChanges?.updated.length
                      ? `${proposalChanges.updated.length} changed · `
                      : ""}
                    {proposalChanges?.settings.length
                      ? `${proposalChanges.settings.join(", ")} · `
                      : ""}
                    revision {proposal.baseRevision}
                  </p>
                  <div>
                    <button
                      disabled={busy || recording !== null}
                      onClick={() => {
                        setPlaying(false);
                        setProgress(0);
                        setExplode(0);
                        setPreviewProposal(!previewProposal);
                      }}
                    >
                      <Eye size={13} />
                      {previewProposal ? "Back to current" : "Preview changes"}
                    </button>
                    <button disabled={busy || recording !== null} onClick={applyProposal}>
                      <Check size={13} />
                      Apply changes
                    </button>
                    <button
                      className="scene-icon-button"
                      aria-label="Dismiss proposal"
                      onClick={discardSavedProposal}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {proposal.scene.geometry && (
                    <a
                      className="scene-native-download"
                      href={
                        "/api/scene-geometry?kind=blend&id=" +
                        encodeURIComponent(proposal.scene.geometry.id)
                      }
                    >
                      Download edited .blend
                    </a>
                  )}
                </div>
              )}
              <div ref={chatEnd} />{" "}
              <details className="scene-connection-details">
                <summary>{runtime.available ? "Agent details" : "Connect the agent"}</summary>
                <p>
                  {runtime.available
                    ? runtime.mode === "local"
                      ? "Messages and photos use your Keychain API key. Review changes before applying."
                      : "Sol and native Blender edits use metered hosted compute. Review changes before applying."
                    : (runtime.reason ??
                      "Sign in with an enabled account to use chat. Connected agents can also propose edits through page tools.")}
                </p>
              </details>
            </div>
          </div>
          <div
            id="scene-sidebar-panel-scene"
            role="tabpanel"
            aria-labelledby="scene-sidebar-tab-scene"
            hidden={sidebarTab !== "scene"}
            className="scene-sidebar-panel scene-sidebar-settings studio-popover"
            tabIndex={0}
          >
            <div className="scene-properties">
              <div>
                <span className="scene-panel-label">{part ? "SELECTED PART" : "ANIMATION"}</span>
                <strong>{part ? pretty(part.name) : "Explode & reassemble"}</strong>
              </div>
              {part && (
                <>
                  <div className="scene-vector-inputs">
                    <span>Position</span>
                    {["X", "Y", "Z"].map((axis, i) => (
                      <label key={axis}>
                        {axis}
                        <input
                          aria-label={axis + " position"}
                          type="number"
                          step=".1"
                          min="-100"
                          max="100"
                          value={part.position[i]}
                          disabled={frozen}
                          onChange={(e) => {
                            const vector = [...part.position];
                            vector[i] = Number(e.target.value);
                            updatePart(part.id, { position: vector });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="scene-vector-inputs">
                    <span>Separation</span>
                    {["X", "Y", "Z"].map((axis, i) => (
                      <label key={axis}>
                        {axis}
                        <input
                          aria-label={axis + " separation"}
                          type="number"
                          step=".1"
                          min="-100"
                          max="100"
                          value={Number(part.explode[i].toFixed(3))}
                          disabled={frozen}
                          onChange={(e) => {
                            const vector = [...part.explode];
                            vector[i] = Number(e.target.value);
                            updatePart(part.id, { explode: vector });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    className="scene-icon-button"
                    aria-label="Clear part selection"
                    onClick={() => setSelected(null)}
                  >
                    <X size={16} />
                  </button>
                </>
              )}
              <>
                <label>
                  Duration
                  <select
                    aria-label="Animation duration"
                    value={scene.animation.duration}
                    disabled={frozen}
                    onChange={(e) =>
                      settings({
                        animation: {
                          ...scene.animation,
                          duration: Number(e.target.value),
                        },
                      })
                    }
                  >
                    {[6, 8, 10, 12, 14].map((n) => (
                      <option key={n} value={n}>
                        {n} seconds
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Camera
                  <select
                    aria-label="Camera movement"
                    disabled={frozen}
                    value={scene.camera.orbit}
                    onChange={(e) =>
                      settings({
                        camera: { ...scene.camera, orbit: Number(e.target.value) },
                      })
                    }
                  >
                    <option value="0">Fixed view</option>
                    <option value="90">Quarter orbit</option>
                    <option value="360">Full orbit</option>
                    <option value="-360">Reverse orbit</option>
                  </select>
                </label>
                <label>
                  Background
                  <select
                    aria-label="Scene background"
                    disabled={frozen}
                    value={scene.background}
                    onChange={(e) => settings({ background: e.target.value as "white" | "studio" })}
                  >
                    <option value="studio">Obsidian</option>
                    <option value="white">White</option>
                  </select>
                </label>
              </>
            </div>{" "}
            <div className="scene-explode-control">
              <div className="scene-explode-heading">
                <span>Separation</span>
                <output>{Math.round(explode * 100)}%</output>
              </div>
              <input
                aria-label="Explode assembly"
                type="range"
                min="0"
                max="1"
                step=".005"
                value={explode}
                disabled={frozen || playing}
                onChange={(e) => {
                  setProgress(0);
                  setExplode(Number(e.target.value));
                }}
              />
              <div className="scene-explode-labels">
                <span>Assembled</span>
                <span>Exploded</span>
              </div>
            </div>
            <details className="scene-assumptions">
              <summary>
                Source & assumptions <span>{scene.assumptions.length}</span>
              </summary>
              {scene.assumptions.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </details>
          </div>
          <div className="scene-sidebar-footer">
            <div className="scene-top-actions">
              <span className="scene-save-status" role="status">
                {saveStatus}
              </span>
              <button
                className="scene-icon-button"
                title="Undo"
                aria-label="Undo scene edit"
                disabled={frozen || !undoCount}
                onClick={() => undo()}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="scene-icon-button"
                title="Redo"
                aria-label="Redo scene edit"
                disabled={frozen || !redoCount}
                onClick={() => undo(true)}
              >
                <RotateCw size={17} />
              </button>
              <button className="scene-secondary" disabled={frozen} onClick={() => void save()}>
                <Save size={14} />
                Save
              </button>
              <button className="scene-primary" disabled={frozen} onClick={() => void render()}>
                {recording !== null ? (
                  <LoaderCircle size={15} className="scene-spin" />
                ) : (
                  <Play size={14} />
                )}{" "}
                {recording !== null
                  ? "Rendering " + Math.round(recording * 100) + "%"
                  : "Render previs"}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {error && (
        <div className="scene-error" role="alert">
          <p>{error}</p>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </main>
  );
}
