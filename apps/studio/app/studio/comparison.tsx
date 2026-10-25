"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Maximize, Minimize, RotateCcw, SlidersHorizontal, Play, Pause } from "lucide-react";
import { ptzSample } from "../../lib/ptz-comparison";
type Props = {
  source: string;
  result: string;
  storageKey?: string;
  resultLabel?: string;
  hero?: boolean;
  profile?: "ptz";
  controlsTarget?: HTMLElement | null;
};
type Settings = {
  mode: "split" | "blend" | "dual";
  reveal: number;
  offset: number;
  scale: number;
  x: number;
  y: number;
  speed: number;
};
const defaults: Settings = {
  mode: "split",
  reveal: 50,
  offset: 0,
  scale: 1,
  x: 0,
  y: 0,
  speed: 1,
};
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
export default function Comparison({
  source,
  result,
  storageKey = "preview",
  resultLabel = "AI VARIANT",
  hero = false,
  profile,
  controlsTarget,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(false);
  const autoStarted = useRef(false);
  const mixPhase = useRef(0);
  const [breathing, setBreathing] = useState(hero);
  const [fullscreenTarget, setFullscreenTarget] = useState<HTMLElement | null>(null);
  const fullscreen = fullscreenTarget !== null;
  const a = useRef<HTMLVideoElement>(null),
    b = useRef<HTMLVideoElement>(null),
    epoch = useRef(0),
    wanted = useRef(false),
    buffering = useRef(false),
    restarting = useRef(false);
  const [settings, setSettings] = useState<Settings>({
      ...defaults,
      mode: hero ? "blend" : "split",
    }),
    [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0),
    [error, setError] = useState("");
  const { mode, reveal, offset, scale, x, y, speed } = settings;
  const adjusted = offset !== 0 || scale !== 1 || x !== 0 || y !== 0 || speed !== 1;
  useEffect(() => {
    const changed = () =>
      setFullscreenTarget(document.fullscreenElement === root.current ? root.current : null);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      setError("Fullscreen is unavailable in this browser.");
    }
  }
  useEffect(() => {
    if (hero) return;
    // Restore browser-only preferences after hydration, before the next paint.
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(
          localStorage.getItem("blackblend.compare.v2." + storageKey) ?? "null",
        );
        if (saved)
          setSettings({
            mode: ["split", "blend", "dual"].includes(saved.mode) ? saved.mode : "split",
            reveal: clamp(saved.reveal, 0, 100),
            offset: clamp(saved.offset, -15, 15),
            scale: clamp(saved.scale, 0.5, 2),
            x: clamp(saved.x, -50, 50),
            y: clamp(saved.y, -50, 50),
            speed: [0.25, 0.5, 1, 1.5, 2].includes(saved.speed) ? saved.speed : 1,
          });
      } catch {}
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey, hero]);
  function update(patch: Partial<Settings>) {
    setBreathing(false);
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        if (!hero)
          localStorage.setItem("blackblend.compare.v2." + storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  function pause() {
    epoch.current++;
    wanted.current = false;
    buffering.current = false;
    a.current?.pause();
    b.current?.pause();
    setPlaying(false);
  }
  useEffect(() => {
    epoch.current++;
    wanted.current = false;
    a.current?.pause();
    b.current?.pause();
    const frame = requestAnimationFrame(() => {
      setPlaying(false);
      setPosition(0);
      setError("");
    });
    return () => {
      cancelAnimationFrame(frame);
      epoch.current++;
      wanted.current = false;
      a.current?.pause();
      b.current?.pause();
    };
  }, [source, result]);
  const target = (time: number, durationA: number, durationB: number) =>
    clamp(
      (profile === "ptz"
        ? ptzSample(time, durationA, durationB).time
        : (time / durationA) * durationB) + offset,
      0,
      Math.max(0, durationB - 0.04),
    );
  useEffect(() => {
    let frame: number,
      last = 0,
      lastMix = 0;
    const tick = (now: number) => {
      const source = a.current,
        result = b.current;
      if (breathing && !reducedMotion.current && !document.hidden && !source?.paused) {
        mixPhase.current += lastMix ? Math.min(now - lastMix, 100) / 12000 : 0;
        setSettings((current) => ({
          ...current,
          mode: "blend",
          reveal: 50 + 44 * Math.sin(mixPhase.current * Math.PI * 2),
        }));
      }
      lastMix = now;
      if (source && result && source.duration > 0 && result.duration > 0) {
        if (profile === "ptz") {
          const frame = ptzSample(source.currentTime, source.duration, result.duration);
          source.style.transform = `translate(${frame.x + x}%,${frame.y + y}%) scale(${frame.scale * scale})`;
        }
        if (now - last > 80) {
          setPosition((source.currentTime / source.duration) * 1000);
          last = now;
        }
        if (!source.paused && !source.seeking && !result.seeking) {
          const sample =
            profile === "ptz"
              ? ptzSample(source.currentTime, source.duration, result.duration)
              : null;
          const mapped = clamp(
            (sample?.time ?? (source.currentTime / source.duration) * result.duration) + offset,
            0,
            Math.max(0, result.duration - 0.04),
          );
          if (Math.abs(result.currentTime - mapped) > 0.16) result.currentTime = mapped;
          source.playbackRate = speed;
          result.playbackRate = clamp(
            (sample?.rate ?? result.duration / source.duration) * speed,
            0.1,
            8,
          );
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [offset, speed, breathing, profile, scale, x, y]);
  async function start() {
    const source = a.current,
      result = b.current;
    if (!source || !result || restarting.current) return;
    const token = epoch.current;
    restarting.current = true;
    try {
      await Promise.all([source.play(), result.play()]);
      if (token !== epoch.current || !wanted.current) {
        if (!wanted.current) {
          source.pause();
          result.pause();
        }
        return;
      }
      setPlaying(true);
    } catch {
      if (token === epoch.current) {
        pause();
        setError("Playback interrupted. Check the media connection, then press Play again.");
      }
    } finally {
      restarting.current = false;
    }
  }
  async function toggle() {
    if (wanted.current) {
      pause();
      return;
    }
    const source = a.current,
      result = b.current;
    if (!source || !result) return;
    setError("");
    epoch.current++;
    wanted.current = true;
    if (source.ended || source.currentTime >= source.duration - 0.04) source.currentTime = 0;
    if (source.duration > 0 && result.duration > 0)
      result.currentTime = target(source.currentTime, source.duration, result.duration);
    source.playbackRate = speed;
    result.playbackRate =
      source.duration > 0 ? clamp((result.duration / source.duration) * speed, 0.1, 8) : speed;
    await start();
  }
  function seek(value: number) {
    const source = a.current,
      result = b.current;
    if (
      !source ||
      !result ||
      !Number.isFinite(source.duration) ||
      !Number.isFinite(result.duration)
    )
      return;
    source.currentTime = clamp(
      (value / 1000) * source.duration,
      0,
      Math.max(0, source.duration - 0.04),
    );
    result.currentTime = target(source.currentTime, source.duration, result.duration);
    setPosition(value);
  }
  function wait() {
    if (wanted.current && !restarting.current) {
      buffering.current = true;
      a.current?.pause();
      b.current?.pause();
    }
  }
  function ready() {
    if (
      hero &&
      !autoStarted.current &&
      !reducedMotion.current &&
      !document.hidden &&
      (a.current?.readyState ?? 0) >= 3 &&
      (b.current?.readyState ?? 0) >= 3
    ) {
      autoStarted.current = true;
      wanted.current = true;
      void start();
    }
    if (
      wanted.current &&
      buffering.current &&
      (a.current?.readyState ?? 0) >= 3 &&
      (b.current?.readyState ?? 0) >= 3
    ) {
      buffering.current = false;
      void start();
    }
  }
  useEffect(() => {
    if (!hero) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => {
      reducedMotion.current = media.matches;
      if (media.matches) {
        setBreathing(false);
        pause();
      }
    };
    preference();
    media.addEventListener("change", preference);
    const visibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) pause();
    });
    if (root.current) observer.observe(root.current);
    return () => {
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
    };
  }, [hero]);
  const inSidebar = !!controlsTarget && !fullscreen && !hero;
  const options = (
    <div className="comparison-options" aria-label="Comparison mode">
      {(["split", "blend", "dual"] as const).map((value) => (
        <button
          key={value}
          aria-pressed={mode === value && !breathing}
          onClick={() => update({ mode: value })}
        >
          {value === "dual" ? "Side by side" : value === "blend" ? "Blend" : "Split reveal"}
        </button>
      ))}
      {
        <button
          aria-pressed={breathing}
          onClick={() => {
            if (reducedMotion.current) return;
            setSettings((current) => ({ ...current, mode: "blend" }));
            setBreathing((value) => !value);
          }}
        >
          Blend breathe
        </button>
      }
    </div>
  );
  const calibration = (
    <>
      <div className="comparison-calibration">
        <label>
          Playback speed
          <select value={speed} onChange={(e) => update({ speed: Number(e.target.value) })}>
            {[0.25, 0.5, 1, 1.5, 2].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
        <label>
          Result offset (seconds)
          <input
            type="number"
            min="-15"
            max="15"
            step="0.05"
            value={offset}
            onChange={(e) => update({ offset: clamp(Number(e.target.value), -15, 15) })}
          />
        </label>
        <label>
          Source scale
          <input
            type="number"
            min="0.5"
            max="2"
            step="0.01"
            value={scale}
            onChange={(e) => update({ scale: clamp(Number(e.target.value), 0.5, 2) })}
          />
        </label>
        <label>
          Source X (%)
          <input
            type="number"
            min="-50"
            max="50"
            value={x}
            onChange={(e) => update({ x: clamp(Number(e.target.value), -50, 50) })}
          />
        </label>
        <label>
          Source Y (%)
          <input
            type="number"
            min="-50"
            max="50"
            value={y}
            onChange={(e) => update({ y: clamp(Number(e.target.value), -50, 50) })}
          />
        </label>
        <button
          onClick={() => {
            update(defaults);
            seek(0);
          }}
        >
          Reset alignment
        </button>
      </div>
      <p className="hint">Adjust playback and source framing. Settings are saved for this pair.</p>
    </>
  );
  return (
    <div ref={root} className={`comparison${hero ? " comparison-hero" : ""}`}>
      {inSidebar
        ? createPortal(
            <div className="sidebar-comparison-controls">
              {options}
              {calibration}
            </div>,
            controlsTarget!,
          )
        : options}
      <div className={`compare-canvas mode-${mode}`}>
        <video
          ref={b}
          src={result}
          muted
          playsInline
          preload="metadata"
          onWaiting={wait}
          onCanPlay={ready}
          onError={() => {
            pause();
            setError("Could not load the generated video. Refresh project history.");
          }}
        />
        <div
          className="compare-source"
          style={{
            clipPath: mode === "split" ? `inset(0 ${100 - reveal}% 0 0)` : "none",
            opacity: mode === "blend" ? reveal / 100 : 1,
          }}
        >
          <video
            ref={a}
            src={source}
            muted
            playsInline
            preload="metadata"
            style={{ transform: `translate(${x}%,${y}%) scale(${scale})` }}
            onWaiting={wait}
            onCanPlay={ready}
            onError={() => {
              pause();
              setError("Could not load the source animation. Refresh project history.");
            }}
            onEnded={() => {
              if (hero && wanted.current) {
                seek(0);
                void start();
                return;
              }
              if (b.current && a.current)
                b.current.currentTime = target(
                  a.current.duration,
                  a.current.duration,
                  b.current.duration,
                );
              pause();
            }}
          />
        </div>
        <span className="source-label">SOURCE / PREVIS</span>
        <span className="result-label">{resultLabel}</span>
        {mode === "split" && <div className="divider" style={{ left: `${reveal}%` }} />}
        {mode !== "dual" && (
          <input
            className="reveal-input"
            aria-label={mode === "blend" ? "Source opacity" : "Source reveal"}
            type="range"
            min="0"
            max="100"
            value={reveal}
            onChange={(e) => update({ reveal: Number(e.target.value) })}
          />
        )}
      </div>
      <div className="transport">
        <button
          className="comparison-play"
          aria-label={playing ? "Pause" : "Play pair"}
          onClick={() => void toggle()}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
          <span>{playing ? "Pause" : "Play"}</span>
        </button>
        {!hero && (
          <button
            className="comparison-restart"
            aria-label="Restart pair"
            title="Restart pair"
            onClick={() => seek(0)}
          >
            <RotateCcw size={15} />
          </button>
        )}
        <input
          aria-label="Playback position"
          type="range"
          min="0"
          max="1000"
          value={position}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span>
          {mode === "dual"
            ? "Paired"
            : `${Math.round(reveal)}% ${mode === "blend" ? "opacity" : "reveal"}`}
        </span>
        {!hero && (
          <button
            className="comparison-fullscreen"
            aria-label={fullscreen ? "Exit fullscreen comparison" : "Fullscreen comparison"}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        )}
      </div>
      {!hero && !inSidebar && (
        <div className="comparison-tuning">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <SlidersHorizontal size={13} /> Fine-tune <span>{adjusted ? "Adjusted" : ""}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              container={fullscreenTarget ?? undefined}
              side="top"
              align="end"
              className="studio-popover w-[380px] max-w-[calc(100vw-32px)] rounded-2xl border-white/10 bg-[#17171b] text-[#e3e3e9]"
              aria-label="Timing and alignment"
            >
              {calibration}
            </PopoverContent>
          </Popover>
        </div>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            onClick={() => {
              pause();
              setError("");
              a.current?.load();
              b.current?.load();
            }}
          >
            Reload pair
          </button>
        </div>
      )}
    </div>
  );
}
