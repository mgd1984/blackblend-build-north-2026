// Synthetic media generated locally: tests never depend on private CAD or paid APIs.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { after } from "node:test";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackblend-fixtures-"));
after(() => fs.rm(root, { recursive: true, force: true }));
export const cadDir = path.join(root, "cad");
export const demoDir = path.join(root, "demo");
await fs.mkdir(cadDir);
await fs.mkdir(demoDir);
const movie = path.join(cadDir, "synthetic.mp4");
await promisify(execFile)(process.env.FFMPEG_PATH || "ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=white:s=32x32:r=4",
  "-t",
  "14",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  movie,
]);
export const source = pathToFileURL(movie);
await fs.writeFile(
  path.join(cadDir, "synthetic.png"),
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9mQAAAAASUVORK5CYII=",
    "base64",
  ),
);
await fs.writeFile(
  path.join(cadDir, "manifest.json"),
  JSON.stringify([
    {
      id: "synthetic",
      title: "Synthetic test assembly",
      description: "Generated test fixture",
      prompt: "A test",
      image: "synthetic.png",
      video: "synthetic.mp4",
    },
  ]),
);
await fs.copyFile(movie, path.join(demoDir, "ptz-source.mp4"));
