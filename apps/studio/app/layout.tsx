import type { Metadata } from "next";
import "./globals.css";
import "./studio/scene.css";
import "./studio/workbench.css";
import Providers from "./providers";
export const metadata: Metadata = {
  title: "Blackblend — Design, in motion.",
  description:
    "Turn a 3D assembly into a product film. Inspect parts, direct motion and compare AI treatments with the original. Agent-assisted design, in one Studio.",
  openGraph: {
    title: "Blackblend — Design, in motion.",
    description: "Turn a 3D assembly into a product film.",
    images: [
      {
        url: "/media/woodshed-assembly.webp",
        width: 1600,
        height: 900,
        alt: "Exploded woodshed assembly, rendered in Blender",
      },
    ],
    type: "website",
  },
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
