import vinext from "vinext";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { cloudflare, getLocalWorkerdCompatibilityDate } from "@cloudflare/vite-plugin";
import sceneRuntime from './dev/scene-runtime';
export default defineConfig(({ mode, command }) => {
  const values = loadEnv(mode, process.cwd(), "VITE_");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8",
  }).trim();
  return {
    plugins: [
      sceneRuntime(),
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        configPath: "wrangler.jsonc",
        // Local emulation uses the installed runtime; production retains its pinned date.
        config: command === "serve" ? (config) => ({
          compatibility_date: getLocalWorkerdCompatibilityDate().date,
          vars: {...config.vars, APP_ORIGIN: "http://127.0.0.1:4331"},
        }) : undefined,
        inspectorPort: false,
      }),
    ],
    define: {
      __BLACKBLEND_REVISION__: JSON.stringify(revision),
      __BLACKBLEND_RUNTIME__: JSON.stringify(command === "serve" ? "development" : "release"),
      "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(
        values.VITE_CLERK_PUBLISHABLE_KEY || "",
      ),
    },
    server: {
      host: "127.0.0.1",
      port: 4331,
      watch: { usePolling: true, useFsEvents: false },
    },
  };
});
