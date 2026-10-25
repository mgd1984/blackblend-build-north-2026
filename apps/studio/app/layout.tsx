import type { Metadata } from "next";
import "./globals.css";
import "./studio/scene.css";
import "./studio/workbench.css";
import Providers from "./providers";
export const metadata: Metadata = {
  title: "Blackblend — Design, in motion.",
  description:
    "A workspace for agent-assisted physical design. Inspect assemblies, review scene edits and direct product animations. Building toward engineering and digital-twin workflows.",
  metadataBase: new URL("https://blackblend-studio.mgd1984.workers.dev"),
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
