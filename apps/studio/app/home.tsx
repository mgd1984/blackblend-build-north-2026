"use client";
import Link from "next/link";
import { usePageTools } from "../lib/webmcp";
import { z } from "zod";
import Comparison from "./studio/comparison";
import { ArrowUpRight, Check, Plus } from "lucide-react";
const steps = [
  ["01", "Start", "Open the woodshed model or bring a rendered Blender animation."],
  ["02", "Animate", "Set the camera, separate the parts and export a preview animation."],
  ["03", "Finish", "Add a visual direction and reference images. Confirm the price to generate."],
  ["04", "Compare", "Play source and result together. Choose the take that tells the story."],
];
export default function Home() {
  usePageTools([
    {
      name: "blackblend_site_overview",
      description:
        "Read Blackblend's agent-assisted design workflow, offers, current capabilities and physical-AI roadmap.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute(input) {
        z.object({}).strict().parse(input);
        return {
          offers: [
            "Studio: assembly inspection, supported scene edits and animation",
            "Production: directed product films and assembly explanations",
            "Engineering & Design: scoped expert review and workflow consulting",
          ],
          workspaceUrl: "/studio",
          hosted: [
            "private saved takes and media",
            "browser assembly animation and MP4 capture",
            "source/result comparison",
            "operator-only hosted scene edits and approved generation",
          ],
          localOnly: [
            "native Blender authoring and optional desktop execution",
            "approved provider jobs through the desktop adapter",
          ],
          digitalTwins:
            "Physical-AI roadmap: reusable assemblies, simulation-ready assets and relevant physical data. Simulation, connected twins and Omniverse integration are future work.",
          approachUrl: "/perspective",
          paidActions: false,
        };
      },
    },
  ]);
  return (
    <>
      <Link className="skip" href="#main">
        Skip to content
      </Link>
      <header className="nav wrap">
        <Link className="wordmark" href="/" aria-label="Blackblend home">
          <span className="mark">b.</span>blackblend
        </Link>
        <nav aria-label="Main navigation">
          <Link href="#workflow">Workflow</Link>
          <Link href="#agencies">For teams</Link>
          <Link href="/perspective">Our approach</Link>
        </nav>
        <Link className="nav-cta" href="/studio">
          Open studio <ArrowUpRight size={15} />
        </Link>
      </header>
      <main id="main">
        <section className="hero wrap">
          <div className="hero-title">
            <h1>
              Design,
              <br />
              <em>in motion.</em>
            </h1>
            <div className="hero-aside">
              <p>
                Show how it works.
                <br />
                Show how it fits.
              </p>
            </div>
          </div>
          <div className="hero-bottom">
            <p>
              Turn a 3D assembly into a product film.
              <br />
              Direct the parts, motion and finish in one workspace.
            </p>
            <Link className="cta" href="/studio">
              Open studio <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="hero-comparison">
            <Comparison
              source="/media/woodshed-hero-source.mp4"
              result="/media/woodshed-hero-result.mp4"
              sourcePoster="/media/woodshed-source-poster.webp"
              resultPoster="/media/woodshed-result-poster.webp"
              openingTime={2.2}
              resultLabel="AI treatment"
              hero
            />
          </div>
          <div className="film-caption">
            <span>Woodshed · assembly study</span>
            <span>Source animation + AI treatment</span>
          </div>
        </section>
        <section className="statement wrap section">
          <h2>
            The design is there.
            <br />
            Bring it to life.
          </h2>
          <div>
            <p>
              A product model holds the details that make it work. Turning those details into a
              clear visual story takes another set of tools, skills and decisions.
            </p>
            <p>
              Blackblend brings assembly inspection, agent-assisted edits, animation and video
              finishing together. The original stays beside each generated take for review.
            </p>
          </div>
        </section>
        <section id="workflow" className="workflow wrap section">
          <div className="section-head">
            <h2>From model to product film.</h2>
          </div>
          <div className="steps">
            {steps.map(([n, title, copy]) => (
              <article key={n}>
                <span className="step-num">{n}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
          <div className="proof">
            <div className="proof-copy">
              <h3>
                Inspect the
                <br />
                source.
              </h3>
              <p>
                From mechanical detail to a finished shot. Compare the PTZ rig’s Blender animation
                with its AI treatment.
              </p>
            </div>
            <div className="ptz-comparison">
              <Comparison
                source="/media/ptz-compare-source.mp4"
                result="/media/ptz-compare-result.mp4"
                resultLabel="AI treatment"
                profile="ptz"
                hero
              />
            </div>
          </div>
        </section>
        <section className="assembly-studies wrap section" aria-labelledby="studies-title">
          <div className="section-head">
            <h2 id="studies-title">Every part tells a story.</h2>
            <p>Construction, mechanisms and the relationships between them.</p>
          </div>
          <div className="study-grid">
            <figure>
              <img
                src="/media/woodshed-assembly.webp"
                width="1600"
                height="900"
                loading="lazy"
                decoding="async"
                alt="Native woodshed render with the roof, walls and timber extension separated into assembly layers"
              />
              <figcaption>
                <span>Woodshed</span>
                <span>Native Blender render</span>
              </figcaption>
            </figure>
            <figure>
              <img
                src="/media/ptz-concept.webp"
                width="1440"
                height="960"
                loading="lazy"
                decoding="async"
                alt="Exploded PTZ mechanism study with brushed metal plates, shafts, belts and motors on an obsidian background"
              />
              <figcaption>
                <span>PTZ mechanism</span>
                <span>AI concept study</span>
              </figcaption>
            </figure>
          </div>
        </section>
        <section id="agencies" className="agency-section wrap section">
          <div className="agency-heading">
            <h2>
              Put your models
              <br />
              <em>to work.</em>
            </h2>
            <p>
              For design agencies and product teams explaining something complex. Work in Studio,
              commission a film, or bring Blackblend into the design process.
            </p>
            <Link className="text-link" href="/studio">
              Explore the Studio <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="agency-services">
            {[
              [
                "01",
                "Production",
                "Camera and assembly choreography, material direction, film finishing and revisions.",
              ],
              [
                "02",
                "Workflow",
                "Hands-on setup and guidance for teams bringing agents, Blender and CAD into their practice.",
              ],
              [
                "03",
                "Continuity",
                "Plan how reviewed assemblies could support product updates, technical illustrations and service documentation.",
              ],
            ].map(([n, title, copy]) => (
              <article key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section id="digital-twins" className="twin-section section">
          <div className="wrap">
            <div className="twin-heading">
              <h2>
                A foundation for
                <br />
                <em>agentic design.</em>
              </h2>
              <p>
                Physical AI needs models that describe how things fit, move and behave.
                Visualization is our starting point. The next steps are broader model editing,
                reusable assembly knowledge and preparation for simulation and digital twins.
              </p>
            </div>
            <ol className="twin-path">
              <li>
                <h3>Visualize.</h3>
                <p>Available today: inspect assemblies, direct motion and compare takes.</p>
              </li>
              <li>
                <h3>Reuse.</h3>
                <p>
                  Next: preserve part relationships across revisions and technical explanations.
                </p>
              </li>
              <li>
                <h3>Simulate.</h3>
                <p>Research: exchange scenes with physical properties and tested behavior.</p>
              </li>
              <li>
                <h3>Connect.</h3>
                <p>Longer term: link the model to data from the physical asset.</p>
              </li>
            </ol>
            <div className="twin-footnote">
              <p>
                Simulation and connected twins are future capabilities. Each needs validation beyond
                a visual model.
              </p>
              <Link className="text-link" href="/perspective">
                Explore the direction <ArrowUpRight size={17} />
              </Link>
            </div>
          </div>
        </section>
        <section id="ways" className="offers wrap section">
          <div className="section-head">
            <h2>Choose your level of support.</h2>
            <p>
              Use the workspace, commission a visual explanation or scope expert design support.
            </p>
          </div>
          <div className="offer-grid three-tiers">
            {[
              {
                name: "Studio",
                title: "Your model, in motion.",
                price: "$49",
                unit: "CAD / month",
                copy: "Inspect assemblies, direct supported edits and compare visual results.",
                items: [
                  "Browser animation and Blender video input",
                  "Agent-assisted scene edits",
                  "Synchronized video comparison",
                  "Source-linked project records",
                ],
                terms: "Early access. Generation usage is separate.",
                cta: "Open studio",
                href: "/studio",
              },
              {
                name: "Production",
                title: "A finished film.",
                price: "From $1,500",
                unit: "CAD / project",
                copy: "Commission a film or bring us into your agency’s production team.",
                items: [
                  "Source and shot planning",
                  "Camera and assembly choreography",
                  "Material direction and take review",
                  "Defined exports and revisions",
                ],
                terms: "Quoted by scope, schedule and generation budget.",
                cta: "Explore the Studio",
                href: "/studio",
              },
              {
                name: "Engineering & Design",
                title: "Work through the details.",
                price: "$750",
                unit: "CAD / review",
                copy: "Work through an assembly or establish an AI-assisted design workflow.",
                items: [
                  "One assembly, scoped review",
                  "Design and workflow findings",
                  "Parts, BOM and inventory planning",
                  "Manuals and implementation scoped separately",
                ],
                terms: "Broader consulting is quoted after the review.",
                cta: "Explore the Studio",
                href: "/studio",
              },
            ].map((tier) => (
              <article key={tier.name}>
                <div className="offer-label">{tier.name}</div>
                <h3>{tier.title}</h3>
                <div className="tier-price">
                  {tier.price}
                  <small>{tier.unit}</small>
                </div>
                <p>{tier.copy}</p>
                <ul>
                  {tier.items.map((item) => (
                    <li key={item}>
                      <Check />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="offer-terms">{tier.terms}</div>
                <Link className="button outline" href={tier.href}>
                  {tier.cta}
                  <ArrowUpRight size={16} />
                </Link>
              </article>
            ))}
          </div>
          <p className="fine pricing-note">
            Proposed early-access pricing. Generation is charged separately. Subscriptions and
            service checkout are not yet available.
          </p>
        </section>
        <section className="faq wrap section">
          <div>
            <h2>Before you start.</h2>
          </div>
          <div>
            {[
              [
                "Does the AI preserve exact geometry?",
                "Generated video can alter shape and motion. Compare each take against the source; use native Blender renders when exact geometry is required.",
              ],
              [
                "What can I use today?",
                "Explore and animate the woodshed in Studio, save a private take and compare source and result. Hosted scene editing and approved video generation are available to the operator account during early access.",
              ],
              [
                "Who is this for?",
                "Design studios and engineering teams starting with an assembly or rendered animation. The first workflow is product visualization; broader engineering and physical-AI uses are roadmap goals.",
              ],
              [
                "How is work priced?",
                "We are developing Studio subscriptions, Production projects and Engineering & Design reviews. Project quotes will specify deliverables, revisions and generation costs.",
              ],
              [
                "How does this relate to physical AI?",
                "Blackblend starts with agents helping people inspect and revise digital models of physical products. Today’s workflow covers visualization and supported edits. Simulation-ready assets, connected twins and robotics workflows need further development and validation.",
              ],
              [
                "Where does my project go?",
                "Your projects, videos and Blender edits are private to your account. Local Blender files stay on your computer unless you upload them. Check the animation, references and price before starting a paid video job.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={15} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing wrap">
          <h2>What are you building?</h2>
          <Link href="/studio" className="cta">
            Open studio <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>
      <footer className="wrap">
        <Link className="wordmark" href="/">
          blackblend<span className="foot-period">.</span>
        </Link>
        <p>Agent-assisted physical design.</p>
        <span>© {new Date().getFullYear()} Blackblend · Early access</span>
      </footer>
    </>
  );
}
