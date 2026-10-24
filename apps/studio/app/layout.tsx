import type { Metadata } from "next";
import "./globals.css";
import "./studio/scene.css";
import "./studio/workbench.css";
import Providers from "./providers";
export const metadata: Metadata = {
  title: "Blackblend — Design, in motion.",
  description:
    "Product and engineering visualization from one source of geometry. Blender animation, agent-directed production and source/result review in one Studio.",
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
