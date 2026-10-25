import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "The product — Blackblend",
  description:
    "Turn an existing 3D assembly animation into a product film. The working workflow, business and roadmap.",
};
export default function Perspective() {
  return (
    <main className="perspective-page">
      <nav aria-label="Page navigation">
        <Link className="wordmark" href="/">
          blackblend.
        </Link>
        <Link className="nav-cta" href="/studio">
          Open studio ↗
        </Link>
      </nav>
      <p className="eyebrow">THE PRODUCT</p>
      <h1>
        From 3D assembly
        <br />
        to product film.
      </h1>
      <p className="intro">
        Designers and engineers already have valuable 3D work. Blackblend turns its camera moves and
        assembly animation into inputs for AI video production, then brings source and result
        together for review.
      </p>
      <section className="section">
        <p className="eyebrow">THE WORKFLOW</p>
        <h2>Animate. Finish.</h2>
        <p>
          Animate the editable woodshed, or import an MP4 rendered in Blender. In Finish, set the
          appearance and references, approve the generation price, and compare the result. Saved
          takes live in the Library throughout.
        </p>
        <p>
          Camera and component motion are authored in the source. The generated treatment can change
          shape or timing; synchronized comparison makes those differences visible.
        </p>
      </section>
      <section className="section">
        <p className="eyebrow">WORKING TODAY</p>
        <h2>From assembly to finished video.</h2>
        <p>
          Use the woodshed to inspect parts, ask for edits, animate the assembly and export a
          preview video. Add reference images for an AI treatment, then compare both videos. Hosted
          chat, Blender editing and generation are limited to approved accounts during early access.
        </p>
        <p>
          Start with the included model or your rendered animation. General CAD import, reliable
          photo reconstruction and unrestricted Blender authoring are development goals.
        </p>
      </section>
      <section className="section">
        <p className="eyebrow">THE BUSINESS</p>
        <h2>Repeatable work for product teams.</h2>
        <p>
          The first customer is a design studio or engineering team producing product films and
          assembly explanations. The proposed model is a Studio subscription plus clearly priced
          generation usage. Expert production and engineering support cover more involved projects.
        </p>
        <p>
          Early pilots need to establish time saved per approved film, repeat usage and contribution
          margin after generation, retries, storage and support. Pricing and demand are being
          tested.
        </p>
      </section>
      <section className="section">
        <p className="eyebrow">NEXT</p>
        <h2>Broader inputs. Repeatable shots.</h2>
        <p>
          Improve model import, reusable choreography, geometry edits and recovery across source
          revisions. Build a repeatable evaluation set for camera fidelity, part identity and
          assembly timing. Expand into stills, interactive explainers and technical illustrations as
          those workflows earn their place.
        </p>
      </section>
      <section className="section">
        <p className="eyebrow">INFERENCE ROADMAP</p>
        <h2>More choices for each accepted shot.</h2>
        <p>
          Prodia documents a Tenstorrent-backed Wan 2.2 image-to-video endpoint, and Tenstorrent
          describes its Blackhole video work with Prodia. That creates a concrete route for
          investigating alternative inference hardware.
        </p>
        <p>
          Blackblend currently uses fal’s H3 Max 3D-to-video path for animation-conditioned
          treatment. A Blackhole path needs a compatible model, access to weights and usage rights,
          and benchmarks for fidelity, latency and cost per accepted shot. Porting the particular H3
          pipeline remains unproven.
        </p>
        <p>
          <a href="https://docs.prodia.com/reference/pricing/">
            Prodia model and pricing documentation ↗
          </a>
          <br />
          <a href="https://tenstorrent.com/deploy">Tenstorrent’s published demonstration ↗</a>
          <br />
          <a href="https://fal.ai/models/minimax/h3-max/3d-to-video/api">Current fal endpoint ↗</a>
        </p>
      </section>
      <p className="sources">
        The immediate goal is a dependable model-to-film workflow.{" "}
        <Link href="/studio">Try the woodshed ↗</Link>
      </p>
    </main>
  );
}
