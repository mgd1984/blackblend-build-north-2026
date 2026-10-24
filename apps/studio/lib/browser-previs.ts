// The muxer is loaded only when exporting; scene navigation does not load encoding code.
export const PREVIS_FPS = 24;
export const PREVIS_WIDTH = 1280;
export const PREVIS_HEIGHT = 720;
export const PREVIS_BITRATE = 6_000_000;

/** Fixed frame times, including exact choreography endpoints, with no wall-clock drift. */
export function previsFrames(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 2 || seconds > 15)
    throw Error("Previs duration must be between 2 and 15 seconds.");
  const count = Math.round(seconds * PREVIS_FPS);
  const duration = seconds / count;
  return Array.from({ length: count }, (_, index) => ({
    timestamp: index * duration,
    duration,
    progress: index / (count - 1),
  }));
}

/** Returns null only when AVC encoding is unavailable, enabling a truthful WebM fallback. */
export async function encodeCanvasMp4(
  canvas: HTMLCanvasElement,
  seconds: number,
  render: (progress: number) => void,
  onProgress: (progress: number) => void,
): Promise<Blob | null> {
  const frames = previsFrames(seconds);
  if (typeof VideoEncoder === "undefined") return null;
  const { Output, BufferTarget, CanvasSource, Mp4OutputFormat, canEncodeVideo } = await import("mediabunny");
  if (!await canEncodeVideo("avc", { width: canvas.width, height: canvas.height, bitrate: PREVIS_BITRATE })) return null;
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, { codec: "avc", bitrate: PREVIS_BITRATE, keyFrameInterval: 1 });
  output.addVideoTrack(source, { frameRate: frames.length / seconds });
  try {
    await output.start();
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index];
      render(frame.progress);
      await source.add(frame.timestamp, frame.duration, { keyFrame: index % PREVIS_FPS === 0 });
      onProgress((index + 1) / frames.length);
      // Yield between batches so export progress and cancel/navigation remain responsive.
      if (index % 8 === 7) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    source.close();
    await output.finalize();
    if (!output.target.buffer) throw Error("The MP4 encoder produced no video.");
    return new Blob([output.target.buffer], { type: "video/mp4" });
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }
}
