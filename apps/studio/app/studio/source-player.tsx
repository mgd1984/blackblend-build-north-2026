"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Download } from "lucide-react";
const time = (seconds: number) =>
  Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
export default function SourcePlayer({ src }: { src: string }) {
  const video = useRef<HTMLVideoElement>(null),
    root = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false),
    [muted, setMuted] = useState(true),
    [position, setPosition] = useState(0),
    [duration, setDuration] = useState(0),
    [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    const sync = () => {
      setDuration(Number.isFinite(player.duration) ? player.duration : 0);
      setPosition(player.currentTime);
      setPlaying(!player.paused && !player.ended);
    };
    // Cached media can load before React attaches its event handlers.
    player.addEventListener("loadedmetadata", sync);
    player.addEventListener("durationchange", sync);
    const frame = requestAnimationFrame(sync);
    return () => {
      cancelAnimationFrame(frame);
      player.removeEventListener("loadedmetadata", sync);
      player.removeEventListener("durationchange", sync);
    };
  }, [src]);
  async function toggle() {
    const player = video.current;
    if (!player) return;
    try {
      if (player.paused) await player.play();
      else player.pause();
      setError("");
    } catch {
      setError("Playback could not start. Try again.");
    }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
      setError("");
    } catch {
      setError("Fullscreen is unavailable in this browser.");
    }
  }
  return (
    <div className="source-player" ref={root}>
      <div className="source-player-stage">
        <video
          ref={video}
          src={src}
          muted={muted}
          playsInline
          preload="metadata"
          aria-label="Source animation"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const n = e.currentTarget.duration;
            setDuration(Number.isFinite(n) ? n : 0);
          }}
          onError={() =>
            setError("This video could not be loaded. Refresh the project to reconnect.")
          }
        />
      </div>
      <div className="source-player-transport" role="group" aria-label="Source playback">
        <button
          className="player-play"
          onClick={() => void toggle()}
          aria-label={playing ? "Pause source" : "Play source"}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <span className="player-time">{time(position)}</span>
        <input
          aria-label="Source playback position"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={duration ? Math.round((position / duration) * 1000) : 0}
          disabled={!duration}
          onChange={(e) => {
            if (video.current && duration) {
              const next = (Number(e.target.value) / 1000) * duration;
              video.current.currentTime = next;
              setPosition(next);
            }
          }}
        />
        <span className="player-time player-duration">{time(duration)}</span>
        <button
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? "Unmute source" : "Mute source"}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button
          aria-label={fullscreen ? "Exit fullscreen source" : "Fullscreen source"}
          onClick={() => void toggleFullscreen()}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <a href={src} download aria-label="Download source video" title="Download source video">
          <Download size={16} />
        </a>
      </div>
      {error && (
        <p className="source-player-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
