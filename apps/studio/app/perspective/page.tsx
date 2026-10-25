import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "The opportunity — Blackblend",
  description:
    "Agent-assisted physical design, starting with product visualization. The working prototype, business model and path toward engineering and physical AI.",
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
      <p className="eyebrow">THE OPPORTUNITY</p>
      <h1>
        Physical design,
        <br />
        with agents.
      </h1>
      <p className="intro">
        Physical AI needs useful digital models of products, machines and environments. Blackblend
        is building a workspace where people and agents can inspect those models, direct changes and
        put the results to work. Product visualization is the first working application.
      </p>
      <section className="section">
        <p className="eyebrow">THE PROBLEM</p>
        <h2>Existing geometry. More work to make it useful.</h2>
        <p>
          A 3D model is a starting point. Preparing an assembly explanation, a product film or a
          simulation involves decisions about parts, motion and what the model represents. Our
          hypothesis is that agents can help with that preparation while people direct and review
          the work.
        </p>
      </section>
      <section className="section">
        <p className="eyebrow">WORKING TODAY</p>
        <h2>Inspect. Direct. Review.</h2>
        <p>
          Inspect the woodshed assembly, ask for a supported scene edit, review the proposal and
          choose camera and assembly motion. Export a preview animation or bring a rendered Blender
          MP4. Add references for an AI visual treatment, then compare the result with the source.
        </p>
        <p>
          Hosted chat, the fixed Blender window tool and generation are restricted to approved
          accounts. Generated footage can alter parts or motion. The source remains available for
          inspection; the examples have assumed dimensions and are not engineering-verified.
        </p>
      </section>
      <section className="section">
        <p className="eyebrow">THE BUSINESS</p>
        <h2>Make the model useful more than once.</h2>
        <p>
          Start with design studios and engineering teams producing product films and assembly
          explanations. The proposed model is a workspace subscription, separately priced execution
          and scoped expert design or engineering support. Customer checkout is not enabled.
        </p>
        <p>
          Pilots need to establish time and total cost per accepted deliverable, correction effort
          and repeat use. The expansion opportunity is reusing reviewed assemblies across product
          revisions, technical sales, training and service. Demand and margins remain to be tested.
        </p>
      </section>
      <section className="section">
        <p className="eyebrow">THE ROADMAP</p>
        <h2>From visualization to physical-AI preparation.</h2>
        <p>
          First, broaden model inputs and agent editing with reliable geometry checks and revision
          handling. Then develop richer part relationships and reusable assembly procedures.
          Simulation-ready assets and digital twins require additional physical properties,
          validated behavior and relevant data from the physical system.
        </p>
        <p>
          OpenUSD exchange, simulation, robotics and connected twins are future work. General
          Blender code editing is an experiment outside the current release.
        </p>
      </section>
      <section className="section">
        <p className="eyebrow">THE INDUSTRY DIRECTION</p>
        <h2>Agents are entering the design workflow.</h2>
        <p>
          Autodesk Assistant already supports inspecting and editing Fusion designs. NVIDIA offers
          agent tools for scene preparation and simulation through Omniverse. These developments
          support the broader direction and set a high bar for Blackblend: useful, reliable work
          across models and tools, with clear review of the results.
        </p>
        <p>
          <a href="https://help.autodesk.com/view/fusion360/ENU/?contextId=LEARNINGPANEL">
            Autodesk Assistant capabilities ↗
          </a>
          <br />
          <a href="https://developer.nvidia.com/omniverse">NVIDIA Omniverse tools for agents ↗</a>
        </p>
        <p>Neither platform is integrated with Blackblend today.</p>
      </section>
      <section className="section">
        <p className="eyebrow">INFERENCE RESEARCH</p>
        <h2>Measure the cost of useful work.</h2>
        <p>
          Authoring, rendering and viewing have different costs. We need to measure inference,
          compute, failed attempts and human correction together for each accepted result.
          Blackblend currently uses fal’s H3 Max 3D-to-video endpoint for visual treatment.
        </p>
        <p>
          Alternative hardware, including Tenstorrent Blackhole, is a research direction. Model
          compatibility, weight access, licensing and quality benchmarks come first. No Blackblend
          H3 port or hardware cost advantage has been demonstrated.
        </p>
      </section>
      <p className="sources">
        Explore the working assembly-to-video workflow. <Link href="/studio">Open Studio ↗</Link>
      </p>
    </main>
  );
}
