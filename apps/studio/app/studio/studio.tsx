"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Upload, Box, Columns2, PanelRightClose, Film, Library } from "lucide-react";
import Account from "../account";
import Editor from "./editor";
import CanvasDock from "./canvas-dock";
import PromptComposer from "./prompt-composer";
import StudioSidebar from "./studio-sidebar";
import SourcePlayer from "./source-player";
import SceneWorkspace from "./scene-workspace";
import type { SceneDocument } from "../../lib/scene-document";
import { readStudioLocation, studioProjectUrl } from "../../lib/studio-location";
import { studioExamples, type StudioExampleId } from "../../lib/studio-examples";
import Comparison from "../studio/comparison";
import { usePageTools } from "../../lib/webmcp";
export default function Studio({
  initialRoute,
}: {
  initialRoute: ReturnType<typeof readStudioLocation>;
}) {
  const initialExample = studioExamples.find((item) => item.id === initialRoute.example)!;
  const [view, setView] = useState<"build" | "examples" | "projects">(initialRoute.view);
  const [projectId, setProjectId] = useState<string | null>(initialRoute.projectId);
  const [exampleId, setExampleId] = useState<StudioExampleId>(initialRoute.example);
  const [source, setSource] = useState<string>(initialExample.source),
    [result, setResult] = useState<string>(initialExample.result),
    [name, setName] = useState(initialExample.title + " · " + initialExample.subtitle),
    [prompt, setPrompt] = useState<string>(initialExample.prompt),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [finishTarget, setFinishTarget] = useState<"examples" | "projects">(
    initialRoute.view === "projects" ? "projects" : "examples",
  );
  const [projectPanel, setProjectPanel] = useState("generate");
  const animationInput = useRef<HTMLInputElement>(null);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(true);
  const [reviewTab, setReviewTab] = useState("source");
  const [comparisonTarget, setComparisonTarget] = useState<HTMLDivElement | null>(null);
  const [isCustomSource, setIsCustomSource] = useState(false);
  const [hasSavedTake, setHasSavedTake] = useState(false);
  const [editingAppearance, setEditingAppearance] = useState(false);
  const sourceFile = useRef<File | null>(null);
  const ownedUrls = useRef<string[]>([]);
  const saving = useRef(false);
  const requestId = useRef("");
  const savedBrief = useRef("");
  const savedFlow = useRef("");
  const uncertain = useRef(false);
  const renderedScene = useRef<SceneDocument | null>(null);
  useEffect(() => () => ownedUrls.current.forEach(URL.revokeObjectURL), []);
  function navigate(next: "build" | "examples" | "projects") {
    setView(next);
    history.replaceState(
      null,
      "",
      next === "projects"
        ? studioProjectUrl(projectId)
        : next === "examples"
          ? "/studio?view=review"
          : "/studio",
    );
  }
  function selectExample(id: StudioExampleId, writeUrl = true) {
    setFinishTarget("examples");
    const example = studioExamples.find((item) => item.id === id)!;
    setExampleId(id);
    setSource(example.source);
    setResult(example.result);
    setName(example.title + " · " + example.subtitle);
    setPrompt(example.prompt);
    sourceFile.current = null;
    setIsCustomSource(false);
    setHasSavedTake(false);
    setEditingAppearance(false);
    renderedScene.current = null;
    savedBrief.current = "";
    savedFlow.current = "";
    requestId.current = "";
    uncertain.current = false;
    setError("");
    if (writeUrl) history.replaceState(null, "", "/studio?example=" + id);
  }
  function choose(file: File | undefined, kind: "source" | "result") {
    if (!file) return false;
    if (!/\.(mp4|mov|webm)$/i.test(file.name) || file.size > 25_000_000 || !file.size) {
      setError("Choose an MP4, MOV or WebM under 25 MB.");
      return false;
    }
    const url = URL.createObjectURL(file);
    ownedUrls.current.push(url);
    setError("");
    if (kind === "source") {
      renderedScene.current = null;
      sourceFile.current = file;
      setIsCustomSource(true);
      setFinishTarget("examples");
      setHasSavedTake(false);
      setEditingAppearance(true);
      setSource(url);
      setName(file.name);
      setResult("");
      savedBrief.current = "";
      savedFlow.current = "";
      requestId.current = "";
      uncertain.current = false;
    } else setResult(url);
    return true;
  }
  function receiveRender(file: File, document: SceneDocument) {
    if (!choose(file, "source")) return;
    renderedScene.current = document;
    setName(document.title + " · revision " + document.revision);
    setPrompt(
      "Photorealistic materials and natural lighting. Preserve the source camera, proportions, part count and assembly motion.",
    );
    setReviewTab("source");
    navigate("examples");
  }
  async function json(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
      error?: string;
      brief: { id: string };
      workflow: { id: string };
    };
    if (res.status === 401) {
      location.assign("/sign-in");
      throw Error("Sign in to save your project.");
    }
    if (!res.ok) throw Error(data.error ?? "Could not save project.");
    return data;
  }
  async function save() {
    if (saving.current) return;
    if (uncertain.current) {
      setError(
        "The previous save may have created a project. Check Your projects before trying again.",
      );
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      requestId.current ||= crypto.randomUUID();
      if (!savedBrief.current) {
        const data = await json("/api/briefs", {
          requestId: requestId.current,
          title: name.slice(0, 120),
          track: "studio",
          audience: "Project reviewers",
          goal: "Review this assembly animation and compare appearance treatments against the native source.",
          source: "video",
          fidelity: "appearance",
        });
        savedBrief.current = data.brief.id;
      }
      if (!savedFlow.current) {
        uncertain.current = true;
        const data = await json("/api/workflows", {
          action: "create",
          briefId: savedBrief.current,
          prompt,
          quality: "480P",
          ...(renderedScene.current ? { scene: renderedScene.current } : {}),
        });
        savedFlow.current = data.workflow.id;
        setHasSavedTake(true);
        uncertain.current = false;
      }
      const body = new FormData();
      body.set("id", savedFlow.current);
      body.set("kind", "source");
      const file =
        sourceFile.current ??
        new File([await (await fetch(source)).blob()], exampleId + "-native.mp4", {
          type: "video/mp4",
        });
      body.set("file", file);
      const res = await fetch("/api/workflows", { method: "POST", body });
      const data = (await res.json()) as {
        error?: string;
        brief: { id: string };
        workflow: { id: string };
      };
      if (!res.ok) throw Error(data.error ?? "Could not save source video.");
      setProjectId(savedFlow.current);
      setFinishTarget("projects");
      setProjectPanel("generate");
      setView("projects");
      history.replaceState(null, "", studioProjectUrl(savedFlow.current));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save project.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  usePageTools([
    {
      name: "blackblend_studio_state",
      description:
        "Read the open studio sample, prompt and comparison state. Sample exploration is local to the browser; saving creates private project records. Hosted video generation requires separate human approval in Studio; desktop execution uses its local approval screen.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute() {
        return {
          project: view === "projects" ? projectId : name,
          view,
          example: exampleId,
          source: !sourceFile.current
            ? exampleId + " native Blender animation"
            : "user-selected local video",
          prompt,
          hasComparison: !!result,
          savedProjectsUrl: "/studio?view=projects",
          billableAction: false,
        };
      },
    },
  ]);
  return (
    <div className="studio-workbench">
      <aside className="workbench-rail" aria-label="Studio navigation">
        <Link
          className="workbench-brand"
          href="/"
          aria-label="Blackblend home"
          title="Blackblend home"
        >
          <span className="mark">b.</span>
        </Link>
        <nav aria-label="Workspace views">
          <button
            aria-label="Animate"
            aria-pressed={view === "build"}
            onClick={() => navigate("build")}
          >
            <Box size={19} />
            <span>Animate</span>
          </button>
          <button
            aria-label="Finish"
            aria-pressed={view !== "build"}
            onClick={() => {
              setProjectPanel("generate");
              navigate(finishTarget);
            }}
          >
            <Film size={19} />
            <span>Finish</span>
          </button>
        </nav>
        <button
          className="workbench-library"
          aria-label="Open saved takes"
          title="Saved takes"
          onClick={() => {
            setProjectPanel("takes");
            setFinishTarget("projects");
            navigate("projects");
          }}
        >
          <Library size={19} />
          <span>Library</span>
        </button>
        <div className="workbench-account">
          <Account />
        </div>
      </aside>
      <input
        ref={animationInput}
        type="file"
        accept="video/mp4,.mp4"
        hidden
        aria-label="Import Blender animation"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && choose(file, "source")) {
            setReviewTab("source");
            navigate("examples");
          }
          event.target.value = "";
        }}
      />
      <div className="workbench-content">
        {view === "build" && error && (
          <div className="studio-intake-error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {view === "build" ? (
          <SceneWorkspace
            onRender={receiveRender}
            onImportAnimation={() => animationInput.current?.click()}
            onViewExample={(id = "woodshed") => {
              selectExample(id);
              setReviewTab("compare");
              setView("examples");
            }}
          />
        ) : view === "projects" ? (
          <Editor
            projectId={projectId}
            activePanel={projectPanel}
            onPanelChange={setProjectPanel}
            onActiveTake={setProjectId}
            onNewProject={() => navigate("build")}
          />
        ) : (
          <main className="studio-main">
            <header className="workbench-heading">
              <div>
                <span className="workbench-section">
                  02 / FINISH · {isCustomSource ? "Your source animation" : "Existing example"}
                </span>
                <h1>{name}</h1>
              </div>
              <div className="review-heading-actions">
                {isCustomSource && (
                  <button className="scene-secondary" onClick={() => navigate("build")}>
                    <ArrowLeft size={14} /> Back to Animate
                  </button>
                )}
                {!reviewPanelOpen && (
                  <button
                    className="scene-secondary scene-open-sidebar"
                    aria-label="Open studio sidebar"
                    aria-expanded={false}
                    aria-controls="review-sidebar"
                    onClick={() => setReviewPanelOpen(true)}
                  >
                    <PanelRightClose size={15} /> Studio
                  </button>
                )}
              </div>
            </header>
            <div
              className={
                "studio-layout studio-canvas-layout" + (!reviewPanelOpen ? " sidebar-closed" : "")
              }
            >
              <section className="studio-view" aria-label="Animation viewer">
                {result ? (
                  <Comparison
                    source={source}
                    result={result}
                    storageKey={"studio-sandbox/" + exampleId}
                    resultLabel="TREATMENT"
                    controlsTarget={comparisonTarget}
                    profile={
                      exampleId === "ptz" && !isCustomSource && result === studioExamples[1].result
                        ? "ptz"
                        : undefined
                    }
                  />
                ) : (
                  <SourcePlayer key={source} src={source} />
                )}
                <p className="fine">
                  {!isCustomSource
                    ? name + " · native source / existing generated take"
                    : name + " · your rendered source"}
                </p>
                {reviewTab === "source" && editingAppearance && (
                  <CanvasDock
                    id="review-treatment"
                    className="studio-controls"
                    label="Appearance composer"
                  >
                    <PromptComposer
                      label="Appearance direction"
                      placeholder="Describe the materials, lighting and finish…"
                      value={prompt}
                      onChange={setPrompt}
                      maxLength={12000}
                      disabled={busy}
                      readOnly={hasSavedTake}
                      busy={busy}
                      submitLabel={busy ? "Saving…" : "Prepare video"}
                      onSubmit={() => void save()}
                    />

                    {!isCustomSource && (
                      <button
                        className="canvas-action-note canvas-cancel-edit"
                        disabled={busy}
                        onClick={() => setEditingAppearance(false)}
                      >
                        Cancel treatment
                      </button>
                    )}
                  </CanvasDock>
                )}
                {error && (
                  <p role="alert" className="error">
                    {error} <button onClick={() => navigate("projects")}>Your projects ↗</button>
                  </p>
                )}
              </section>
              <StudioSidebar
                id="review-sidebar"
                open={reviewPanelOpen}
                active={reviewTab}
                onSelect={setReviewTab}
                onClose={() => setReviewPanelOpen(false)}
                tabs={[
                  {
                    id: "source",
                    label: "Source",
                    icon: Film,
                    content: (
                      <>
                        <div className="sidebar-section">
                          <h2>Source animation</h2>
                          {!isCustomSource && (
                            <div className="studio-example-picker" aria-label="Example product">
                              {studioExamples.map((example) => (
                                <button
                                  key={example.id}
                                  aria-pressed={exampleId === example.id && !isCustomSource}
                                  disabled={busy}
                                  onClick={() => selectExample(example.id)}
                                >
                                  {example.title}
                                </button>
                              ))}
                            </div>
                          )}{" "}
                          <label className="upload-control">
                            <Upload size={16} /> Replace source
                            <input
                              aria-label="Replace source video"
                              type="file"
                              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                              disabled={busy}
                              onChange={(e) => choose(e.target.files?.[0], "source")}
                            />
                          </label>
                          <label className="upload-control">
                            <Upload size={16} /> Compare a video
                            <input
                              aria-label="Choose comparison video"
                              type="file"
                              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                              disabled={busy}
                              onChange={(e) => choose(e.target.files?.[0], "result")}
                            />
                          </label>
                          <p>
                            Start with a Blender animation or the woodshed example. Prepare video
                            saves the source and direction; generation runs after you approve its
                            price.
                          </p>
                          {exampleId === "massey-harris-21" && !isCustomSource && (
                            <p>
                              R04 Blender source / existing barn treatment. Seven assemblies explode
                              and reassemble through a full orbit. Both clips run 12 seconds;
                              compare the generated framing and geometry against the source.
                            </p>
                          )}
                          {!editingAppearance && !hasSavedTake && (
                            <button
                              className="scene-secondary"
                              disabled={busy}
                              onClick={() => setEditingAppearance(true)}
                            >
                              <Film size={14} /> New treatment
                            </button>
                          )}
                        </div>
                      </>
                    ),
                  },
                  {
                    id: "compare",
                    label: "Compare",
                    icon: Columns2,
                    content: (
                      <>
                        {!result && (
                          <p className="sidebar-empty">
                            Add a comparison video in Source to compare it with your animation.
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
        )}
      </div>
    </div>
  );
}
