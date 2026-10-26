"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAuth } from "@clerk/react";
import { clerkKey } from "../providers";
import { usePageTools } from "../../lib/webmcp";
import { command } from "../../lib/workflow-contract";
import { studioProjectUrl } from "../../lib/studio-location";
import Comparison from "./comparison";
import SourcePlayer from "./source-player";
import GenerationPanel from "./generation-panel";
import CanvasDock from "./canvas-dock";
import PromptComposer from "./prompt-composer";
import StudioSidebar from "./studio-sidebar";
import BillingStatus from "./billing-status";
import {
  Film,
  Plus,
  RefreshCw,
  Upload,
  LockKeyhole,
  History,
  Columns2,
  PanelRightClose,
  Sparkles,
} from "lucide-react";
const stageLabel = (status: string) =>
  ({
    draft: "Draft",
    rendered: "Source ready",
    reviewed: "Source ready",
    awaiting_approval: "Ready to generate",
    awaiting_local_approval: "Desktop approval",
    submitted: "Processing",
    completed: "Completed",
  })[status] ?? status.replaceAll("_", " ");
type Flow = {
  id: string;
  briefId: string;
  status: string;
  revision: string;
  prompt: string;
  quality: string;
  sourceHash: string | null;
  source: string | null;
  proof: string | null;
  result: string | null;
  jobId: string | null;
  approvalUrl: string | null;
  localProposal: string | null;
  generationId: string | null;
  metadata?: { scene?: { title: string; revision: number; parts: unknown[] } };
};
type Brief = { id: string; title: string };
type EditorProps = {
  projectId: string | null;
  onNewProject: () => void;
  activePanel: string;
  onPanelChange: (id: string) => void;
  onActiveTake: (id: string) => void;
};
export default function Editor(props: EditorProps) {
  return clerkKey ? <AccountEditor {...props} /> : <EditorCore {...props} />;
}
function AccountEditor(props: EditorProps) {
  const { isLoaded, userId } = useAuth();
  return <EditorCore key={isLoaded ? (userId ?? "guest") : "loading"} {...props} />;
}
function EditorCore({
  projectId,
  onNewProject,
  activePanel: sidebarTab,
  onPanelChange: setSidebarTab,
  onActiveTake,
}: EditorProps) {
  const [flows, setFlows] = useState<Flow[]>([]),
    [selected, setSelected] = useState(projectId ?? ""),
    [briefs, setBriefs] = useState<Brief[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [handoff, setHandoff] = useState<unknown>(null);
  const lock = useRef(false),
    referenceEpoch = useRef(0);
  const [signInRequired, setSignInRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingTake, setEditingTake] = useState(false);
  const [comparisonTarget, setComparisonTarget] = useState<HTMLDivElement | null>(null);
  const [takeDraft, setTakeDraft] = useState<{
    id: string;
    prompt: string;
    quality: string;
  } | null>(null);
  const [runtimeToken, setRuntimeToken] = useState(""),
    [references, setReferences] = useState<string[]>([]),
    [execution, setExecution] = useState<{
      status: string;
      processingSeconds?: number | null;
      totalSeconds?: number | null;
    } | null>(null);
  function select(id: string) {
    if (id !== selected) {
      referenceEpoch.current++;
      setReferences([]);
      setEditingTake(false);
    }
    setSelected(id);
    setHandoff(null);
    history.replaceState(null, "", studioProjectUrl(id));
  }
  const flow = flows.find((f) => f.id === selected) ?? flows[0];
  useEffect(() => {
    if (flow?.id) onActiveTake(flow.id);
  }, [flow?.id, onActiveTake]);
  const prompt = takeDraft && takeDraft.id === flow?.id ? takeDraft.prompt : (flow?.prompt ?? "");
  const quality =
    takeDraft && takeDraft.id === flow?.id ? takeDraft.quality : (flow?.quality ?? "480P");
  function setPrompt(value: string) {
    if (flow) setTakeDraft({ id: flow.id, prompt: value, quality });
  }
  function setQuality(value: string) {
    if (flow) setTakeDraft({ id: flow.id, prompt, quality: value });
  }
  const refresh = useCallback(async () => {
    const res = await fetch("/api/workflows");
    if (!res.headers.get("content-type")?.includes("application/json"))
      throw Error("Studio is restarting. Refresh your projects in a moment.");
    const data = (await res.json()) as { error?: string; workflows: Flow[] };
    if (res.status === 401) {
      setSignInRequired(true);
      setFlows([]);
      setLoading(false);
      return { workflows: [] };
    }
    if (!res.ok) throw Error(data.error ?? "Could not load project.");
    setSignInRequired(false);
    setError("");
    setFlows(data.workflows);
    setSelected((current) => current || data.workflows[0]?.id || "");
    setLoading(false);

    return data;
  }, []);
  useEffect(() => {
    void fetch("/api/scene-agent")
      .then((r) => r.json())
      .then((raw) => setRuntimeToken((raw as { token?: string }).token ?? ""))
      .catch(() => {});
    void Promise.resolve()
      .then(refresh)
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
    void fetch("/api/briefs")
      .then((r) => (r.ok ? r.json() : { briefs: [] }))
      .then((raw) => {
        const data = raw as { briefs: Brief[] };
        setBriefs(data.briefs);
      })
      .catch(() => setError("Could not load briefs."));
  }, [refresh]);
  const asDataUri = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error("Could not read media."));
      reader.readAsDataURL(blob);
    });
  async function addReferences(files: FileList | null) {
    if (!files || lock.current) return;
    const epoch = referenceEpoch.current;
    try {
      if (references.length + files.length > 6) throw Error("Use up to six reference images.");
      const images: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 7_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))
          throw Error("Use PNG, JPEG or WebP references under 7 MB.");
        images.push(await asDataUri(file));
      }
      if ([...references, ...images].reduce((sum, image) => sum + image.length, 0) > 8_000_000)
        throw Error("Use reference images totalling less than 6 MB.");
      if (epoch !== referenceEpoch.current) return;
      setReferences((current) => [...current, ...images]);
      setError("");
    } catch (e) {
      if (epoch === referenceEpoch.current)
        setError(e instanceof Error ? e.message : "Could not read reference images.");
    }
  }
  useEffect(() => {
    if (
      !runtimeToken ||
      !flow ||
      flow.generationId ||
      !["awaiting_local_approval", "submitted"].includes(flow.status)
    )
      return;
    let stopped = false,
      polling = false;
    const current = flow;
    const poll = async () => {
      if (stopped || polling || lock.current) return;
      polling = true;
      try {
        if (current.status === "awaiting_local_approval" && current.localProposal) {
          const response = await fetch(
            "/api/scene-execution?kind=proposal&id=" + current.localProposal,
          );
          if (!response.ok) return;
          const proposal = (await response.json()) as {
            status: string;
            jobId?: string;
            sourceHash: string;
            siteWorkflowId: string;
          };
          if (
            !stopped &&
            proposal.status === "submitted" &&
            proposal.jobId &&
            proposal.sourceHash === current.sourceHash &&
            proposal.siteWorkflowId === current.id
          )
            await act({
              action: "record_submission",
              id: current.id,
              sourceHash: current.sourceHash,
              proposalId: current.localProposal,
              jobId: proposal.jobId,
            });
        } else if (current.jobId) {
          const response = await fetch(
            "/api/scene-execution?kind=job&id=" + encodeURIComponent(current.jobId),
          );
          if (!response.ok) return;
          const job = (await response.json()) as {
            status: string;
            hasVideo: boolean;
            processingSeconds?: number;
            totalSeconds?: number;
          };
          if (stopped) return;
          setExecution(job);
          if (job.hasVideo) {
            const media = await fetch(
              "/api/scene-execution?kind=result&id=" + encodeURIComponent(current.jobId),
            );
            if (media.ok && !stopped)
              await upload(
                "result",
                new File([await media.blob()], "generated.mp4", { type: "video/mp4" }),
              );
          }
        }
      } catch {
        /* Reads resume on the next poll. No provider submission is retried. */
      } finally {
        polling = false;
      }
    };
    const interval = setInterval(() => void poll(), 3000);
    void poll();
    return () => {
      stopped = true;
      clearInterval(interval);
    };
    // Check only the selected job after ownership verification. Never attach old runs automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    runtimeToken,
    flow?.id,
    flow?.status,
    flow?.jobId,
    flow?.localProposal,
    flow?.sourceHash,
    flow?.generationId,
  ]);
  async function act(input: unknown) {
    if (lock.current) throw Error("Another action is running.");
    const data = command.parse(input);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = (await res.json()) as {
        error?: string;
        workflow: Flow;
        handoff?: unknown;
        agentTask?: unknown;
      };
      if (!res.ok) throw Error(result.error ?? "Action failed.");
      select(result.workflow.id);
      setHandoff(result.handoff ?? result.agentTask ?? null);
      await refresh();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function upload(kind: string, file: File) {
    if (!flow || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("id", flow.id);
      body.set("kind", kind);
      body.set("file", file);
      const res = await fetch("/api/workflows", { method: "POST", body });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw Error(data.error);
      setHandoff(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const actionSchema = {
    anyOf: [
      {
        type: "object",
        properties: {
          action: { const: "link_local_approval" },
          id: { type: "string", format: "uuid" },
          sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          proposalId: { type: "string", format: "uuid" },
        },
        required: ["action", "id", "sourceHash", "proposalId"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          action: { const: "create" },
          briefId: { type: "string", format: "uuid" },
          prompt: { type: "string", minLength: 1, maxLength: 12000 },
          quality: { enum: ["480P", "768P", "1080P"] },
        },
        required: ["action", "briefId", "prompt"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          action: { const: "prepare_render" },
          id: { type: "string", format: "uuid" },
        },
        required: ["action", "id"],
        additionalProperties: false,
      },
      ...["review_render", "request_generation"].map((action) => ({
        type: "object",
        properties: {
          action: { const: action },
          id: { type: "string", format: "uuid" },
          sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        },
        required: ["action", "id", "sourceHash"],
        additionalProperties: false,
      })),
      {
        type: "object",
        properties: {
          action: { const: "record_submission" },
          id: { type: "string", format: "uuid" },
          sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          proposalId: { type: "string", format: "uuid" },
          jobId: { type: "string", pattern: "^run-[A-Za-z0-9_-]+$" },
        },
        required: ["action", "id", "sourceHash", "proposalId", "jobId"],
        additionalProperties: false,
      },
    ],
  };
  usePageTools([
    {
      name: "blackblend_read_render_workflows",
      description:
        "Read the visible render/review workflows and current selection. No billing or local computer access.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        z.object({}).strict().parse(input);
        return { workflows: flows, selected: flow?.id ?? null, handoff };
      },
    },
    {
      name: "blackblend_workflow_action",
      description:
        "Save or review a source animation, or link an existing approved Blender job. Preparing generation saves its inputs; a person must approve the paid request in Studio. This tool cannot approve paid generation or run remote Blender.",
      inputSchema: actionSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      execute: act,
    },
    {
      name: "blackblend_refresh_render_workflows",
      description: "Refresh the visible render workflow records and media.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        z.object({}).strict().parse(input);
        return refresh();
      },
    },
  ]);
  const run = (input: unknown) => void act(input).catch(() => {});
  return (
    <>
      <main className="flow-page">
        <div className="workspace-heading">
          <div>
            <span className="workbench-section">Saved take</span>
            <h1>
              {flow
                ? (briefs.find((b) => b.id === flow.briefId)?.title ?? "Project")
                : "Saved takes"}
            </h1>
          </div>
          {!sidebarOpen && (
            <button
              className="scene-secondary scene-open-sidebar"
              aria-label="Open studio sidebar"
              aria-expanded={false}
              aria-controls="project-sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelRightClose size={15} /> Studio
            </button>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}{" "}
            <button onClick={() => void refresh().catch((e) => setError(e.message))}>
              Refresh projects
            </button>
          </p>
        )}
        <div
          className={"flow-layout studio-canvas-layout" + (!sidebarOpen ? " sidebar-closed" : "")}
        >
          <section className="flow-stage">
            {!flow ? (
              <div className="flow-empty">
                <h2>
                  {loading
                    ? "Loading your projects…"
                    : signInRequired
                      ? "Sign in to see your projects."
                      : "Start with a source animation."}
                </h2>
                <p>Explore the woodshed or add a rendered clip.</p>
                {signInRequired ? (
                  <a className="button" href="/sign-in">
                    Sign in
                  </a>
                ) : (
                  <button className="button" onClick={onNewProject}>
                    Choose a source
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="flow-status">
                  <span className="flow-state">
                    <i />
                    {stageLabel(flow.status)}
                  </span>
                  {flow.metadata?.scene && (
                    <span>
                      Scene r{flow.metadata.scene.revision} · {flow.metadata.scene.parts.length}{" "}
                      parts
                    </span>
                  )}
                  {execution && flow.status === "submitted" && (
                    <span>
                      {execution.status}
                      {execution.processingSeconds != null
                        ? " · " + execution.processingSeconds.toFixed(1) + "s"
                        : ""}
                    </span>
                  )}
                  <button
                    className="flow-icon-button"
                    aria-label="Refresh project"
                    title="Refresh project"
                    onClick={() => void refresh().catch((e) => setError(e.message))}
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
                <div className="flow-preview">
                  {flow.source && flow.result ? (
                    <Comparison
                      source={flow.source}
                      result={flow.result}
                      storageKey={"site/" + flow.id}
                      controlsTarget={comparisonTarget}
                    />
                  ) : flow.source ? (
                    <SourcePlayer key={flow.source} src={flow.source} />
                  ) : flow.proof ? (
                    <img
                      className="flow-proof"
                      src={flow.proof}
                      alt="Native Blender render proof"
                    />
                  ) : (
                    <div className="flow-empty">
                      <h2>Native render comes first.</h2>
                      <p>
                        Prepare a scene snapshot, render locally, then upload the proof and
                        animation here.
                      </p>
                    </div>
                  )}
                </div>
                <footer className="flow-preview-footer">
                  <div>
                    <Film size={15} />
                    <span>{flow.result ? "Source / treatment" : "Source animation"}</span>
                  </div>
                  <span>
                    {flow.quality} <span>·</span> Take {flow.id.slice(0, 4)}
                  </span>
                </footer>
              </>
            )}
            {flow && editingTake && sidebarTab === "generate" && (
              <CanvasDock className="canvas-dock video-direction-dock" label="New take composer">
                <PromptComposer
                  label="New take direction"
                  placeholder="Describe materials, lighting and finish…"
                  value={prompt}
                  onChange={setPrompt}
                  maxLength={12000}
                  disabled={busy}
                  busy={busy}
                  submitLabel="Create take"
                  onSubmit={() => run({ action: "create", briefId: flow.briefId, prompt, quality })}
                />
                <button
                  className="canvas-action-note canvas-cancel-edit"
                  disabled={busy}
                  onClick={() => {
                    setEditingTake(false);
                    setTakeDraft(null);
                  }}
                >
                  Cancel new take
                </button>
              </CanvasDock>
            )}
          </section>
          <StudioSidebar
            id="project-sidebar"
            open={sidebarOpen}
            active={sidebarTab}
            onSelect={setSidebarTab}
            onClose={() => setSidebarOpen(false)}
            tabs={[
              {
                id: "takes",
                label: "Takes",
                icon: History,
                content: (
                  <>
                    <div className="sidebar-section sidebar-section-heading">
                      <h2>Projects & takes</h2>
                      <button
                        className="scene-icon-button"
                        onClick={onNewProject}
                        aria-label="New project"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="flow-takes">
                      {flows.map((f) => (
                        <button
                          aria-pressed={flow?.id === f.id}
                          key={f.id}
                          onClick={() => {
                            select(f.id);
                            setSidebarTab("generate");
                          }}
                        >
                          <div className="flow-take-icon">
                            <Film size={17} />
                          </div>
                          <div className="flow-take-name">
                            <strong>
                              {briefs.find((b) => b.id === f.briefId)?.title ?? "Project"}
                            </strong>
                            <span>
                              {stageLabel(f.status)}{" "}
                              <span className="flow-take-id">· {f.id.slice(0, 4)}</span>
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <details className="flow-account-details">
                      <summary>Account & usage</summary>
                      <BillingStatus />
                    </details>
                  </>
                ),
              },
              {
                id: "generate",
                label: "Generate",
                icon: Sparkles,
                content: flow ? (
                  <>
                    <div className="sidebar-section">
                      <h2>Current take</h2>
                      <p className="sidebar-direction">{flow.prompt}</p>
                      <span className="flow-engine">{flow.quality.toLowerCase()} · H3 Max</span>
                    </div>
                    {!editingTake && (
                      <button
                        className="scene-secondary"
                        disabled={busy}
                        onClick={() => {
                          setTakeDraft({ id: flow.id, prompt: flow.prompt, quality: flow.quality });
                          setEditingTake(true);
                        }}
                      >
                        <Plus size={14} /> New take
                      </button>
                    )}
                    {flow.source && !flow.localProposal && (
                      <GenerationPanel
                        key={flow.id}
                        compact
                        workflowId={flow.id}
                        sourceHash={flow.sourceHash}
                        status={flow.status}
                        references={references}
                        onUpdated={refresh}
                        onUseSource={() =>
                          act({ action: "review_render", id: flow.id, sourceHash: flow.sourceHash })
                        }
                      />
                    )}
                    <div className="flow-actions">
                      {flow.status === "draft" && (
                        <button
                          disabled={busy}
                          onClick={() => run({ action: "prepare_render", id: flow.id })}
                        >
                          Prepare Blender render
                        </button>
                      )}
                      {flow.status === "rendered" && runtimeToken && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            run({
                              action: "review_render",
                              id: flow.id,
                              sourceHash: flow.sourceHash,
                            })
                          }
                        >
                          Use this animation
                        </button>
                      )}
                      {flow.approvalUrl && !flow.generationId && (
                        <a
                          className="button outline"
                          target="_blank"
                          rel="noreferrer"
                          href={flow.approvalUrl}
                        >
                          Approve on this computer ↗
                        </a>
                      )}
                    </div>
                    {["rendered", "reviewed"].includes(flow.status) && !flow.generationId && (
                      <div className="flow-references">
                        <label>
                          <span className="flow-upload-label">
                            <Plus size={16} /> Add appearance images
                          </span>
                          <input
                            aria-label="Add appearance references"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            multiple
                            disabled={busy}
                            onChange={(e) => void addReferences(e.target.files)}
                          />
                        </label>
                        <div>
                          {references.map((src, i) => (
                            <button
                              key={i}
                              title="Remove reference"
                              onClick={() =>
                                setReferences((items) => items.filter((_, index) => index !== i))
                              }
                            >
                              <img src={src} alt={"Appearance reference " + (i + 1)} />
                              <span>Remove</span>
                            </button>
                          ))}
                        </div>
                        <p className="fine">Up to six images, 6 MB total. PNG, JPG or WebP.</p>
                      </div>
                    )}

                    <details className="flow-files">
                      <summary>
                        <Upload size={14} /> Add or replace media
                      </summary>
                      <div className="flow-uploads">
                        {(["proof", "source", "result"] as const).map((kind) => (
                          <label key={kind}>
                            {kind === "proof"
                              ? "PNG proof"
                              : kind === "source"
                                ? "Native MP4"
                                : "Generated MP4"}
                            <input
                              aria-label={
                                kind === "proof"
                                  ? "Upload PNG proof"
                                  : kind === "source"
                                    ? "Upload native MP4"
                                    : "Upload generated MP4"
                              }
                              type="file"
                              disabled={
                                busy ||
                                (kind === "result" &&
                                  (flow.status !== "submitted" || !!flow.generationId))
                              }
                              accept={kind === "proof" ? "image/png" : "video/mp4"}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void upload(kind, file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        ))}
                      </div>
                      <p className="fine">MP4 / PNG · 25 MB per file</p>
                    </details>
                    <details className="flow-technical">
                      <summary>Source & execution details</summary>
                      {flow.sourceHash && (
                        <p className="flow-hash">SOURCE SHA-256 / {flow.sourceHash}</p>
                      )}
                      <details>
                        <summary>Job instructions</summary>
                        <pre className="flow-handoff">
                          {JSON.stringify(
                            handoff ?? {
                              siteWorkflowId: flow.id,
                              expectedSourceHash: flow.sourceHash,
                              prompt: flow.prompt,
                              resolution: flow.quality,
                              jobId: flow.jobId,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </details>
                    <p className="flow-private-note">
                      <LockKeyhole size={12} /> Private to your account
                    </p>

                    {editingTake && (
                      <div className="sidebar-section">
                        <h2>New take</h2>
                        <label className="sidebar-field">
                          Output quality
                          <select
                            aria-label="New take quality"
                            value={quality}
                            disabled={busy}
                            onChange={(event) => setQuality(event.target.value)}
                          >
                            <option value="480P">480p</option>
                            <option value="768P">768p</option>
                            <option value="1080P">1080p</option>
                          </select>
                        </label>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="sidebar-empty">
                    Open Takes to choose an animation, or start in Animate.
                  </p>
                ),
              },
              {
                id: "compare",
                label: "Compare",
                icon: Columns2,
                content: (
                  <>
                    {!flow?.result && (
                      <p className="sidebar-empty">
                        Comparison controls appear when this take has a generated result.
                      </p>
                    )}
                    <div ref={setComparisonTarget} />
                  </>
                ),
              },
            ]}
          />
        </div>
      </main>
    </>
  );
}
