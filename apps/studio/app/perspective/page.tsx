import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our approach — Blackblend",
  description: "Product visualization today. Agent-assisted design next.",
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
      <article>
        <h1>Our approach.</h1>
        <p className="intro">
          Blackblend helps design studios and hardware teams turn 3D assemblies into product films.
        </p>
        <section>
          <h2>Start with visualization.</h2>
          <p>
            Inspect a model, direct the camera and assembly motion, then use generative video to
            finish the shot. Keep the original animation alongside the result to see what changed.
          </p>
        </section>
        <section>
          <h2>Build toward agentic CAD.</h2>
          <p>
            The next step is broader model editing through Blender. An agent helps prepare and
            revise the design; people review the changes. Those models could then support assembly
            guides, service work and, over time, simulation and digital twins.
          </p>
        </section>
        <section>
          <h2>Software and expertise.</h2>
          <p>
            Three offers: a Studio subscription with usage-based generation, commissioned product
            films, and hands-on design or engineering support. Expert projects help identify the
            work worth automating.
          </p>
        </section>
        <section>
          <h2>Make the economics work.</h2>
          <p>
            Today, video finishing uses fal’s H3 Max. We’re interested in compatible models on
            alternative hardware such as Tenstorrent Blackhole. The measure is total cost per
            accepted result, including corrections.
          </p>
        </section>
        <Link className="text-link" href="/studio?example=woodshed">
          Try the woodshed example ↗
        </Link>
      </article>
    </main>
  );
}
