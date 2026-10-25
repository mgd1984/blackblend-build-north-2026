"use client";
import Link from "next/link";
import { usePageTools } from "../lib/webmcp";
import { z } from "zod";
import Comparison from "./studio/comparison";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Plus,
} from "lucide-react";
const steps = [
  ["01", "Start", "Open the woodshed model or bring a rendered Blender animation."],
  ["02", "Animate", "Direct the camera and assembly motion, then render a previs."],
  ["03", "Finish", "Choose materials, lighting and references. Approve the generation price."],
  ["04", "Compare", "Check the generated take against the source and download your result."],
];
export default function Home() {
  usePageTools([
    {
      name: "blackblend_site_overview",
      description:
        "Read Blackblend's offers, the workspace URL, and the workflow across the hosted workspace and local rendering.",
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
            "Studio: self-directed workspace",
            "Production: product films and agency production support",
            "Engineering & Design: scoped review and AI workflow consulting",
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
          digitalTwins: "Future direction: revision-linked assets, validated simulation and physical data. No connected twin or Omniverse integration is shipped.",
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
          <Link href="#agencies">For studios</Link>
          <Link href="/perspective">Our approach</Link>
          <Link href="#agents">For agents</Link>
        </nav>
        <Link className="nav-cta" href="/studio">
          Open studio <ArrowUpRight size={15} />
        </Link>
      </header>
      <main id="main">
        <section className="hero wrap">
          <div className="hero-kicker">
            <span className="live-dot" /> PRODUCT & ENGINEERING VISUALIZATION{" "}
            <span>EARLY ACCESS</span>
          </div>
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
              <span>CAD → CHOREOGRAPHY → FILM</span>
            </div>
          </div>
          <div className="hero-bottom">
            <p>
              Turn your 3D animation into a product film.
              <br />
              Direct the motion in 3D. Develop the appearance with AI. Compare the result.
            </p>
            <Link className="cta" href="/studio">
              Open studio <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="hero-comparison">
            <Comparison
              source="/media/woodshed-hero-source.mp4"
              result="/media/woodshed-hero-result.mp4"
              resultLabel="GENERATED / FAL"
              hero
            />
          </div>
          <div className="film-caption">
            <span>Woodshed · assembly study</span>
            <span>Previs → generated take · drag to compare</span>
          </div>
        </section>
        <section className="statement wrap section">
          <p className="eyebrow">ONE SOURCE / MANY OUTPUTS</p>
          <div>
            <h2>
              Your geometry,
              <br />
              brought to life.
            </h2>
            <p>
              Blackblend helps designers and engineers turn existing 3D work into product films. Animate the assembly, direct an AI treatment, and inspect the result beside the native source.
            </p>
            <p className="quiet">
              Today: native animation and generated-take comparison. Next: repeatable scene preparation and revision-linked deliverables.
            </p>
          </div>
        </section>
        <section id="workflow" className="workflow wrap section">
          <div className="section-head">
            <p className="eyebrow">THE WORKFLOW</p>
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
              <span className="eyebrow">ALSO IN THE STUDIO</span>
              <h3>
                Inspect the
                <br />
                source.
              </h3>
              <p>
                A native Blender animation alongside its generated treatment.
                Drag the reveal to compare the same motion.
              </p>
              <small>PTZ camera rig · matched motion + adaptive framing.</small>
            </div>
            <div className="ptz-comparison">
              <Comparison
                source="/media/ptz-compare-source.mp4"
                result="/media/ptz-compare-result.mp4"
                resultLabel="GENERATED / FAL"
                profile="ptz"
                hero
              />
            </div>
          </div>
        </section>
        <section id="agencies" className="agency-section wrap section">
          <div className="agency-heading">
            <p className="eyebrow">FOR INDEPENDENTS & DESIGN STUDIOS</p>
            <h2>Another pair<br /><em>of capable hands.</em></h2>
            <p>Bring us in for a demanding shot, a product launch or a new way
              of working. We can support your team behind the scenes or collaborate
              directly with your client.</p>
            <Link className="text-link" href="/studio">
              Explore the Studio <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="agency-services">
            {[
              ["01", "Production", "Camera and assembly choreography, material direction, film finishing and revisions."],
              ["02", "Workflow", "Hands-on setup and guidance for teams bringing agents, Blender and CAD into their practice."],
              ["03", "Continuity", "A path from launch assets to product updates, technical illustrations and documentation."],
            ].map(([n,title,copy]) => <article key={n}><span>{n}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}
            <p className="fine">Scope, confidentiality, client relationships and source-file delivery agreed per project.</p>
          </div>
        </section>
        <section id="digital-twins" className="twin-section section">
          <div className="wrap">
            <div className="twin-heading">
              <p className="eyebrow">THE LONGER VIEW</p>
              <h2>One product.<br /><em>A longer useful life.</em></h2>
              <p>A well-prepared digital model can serve a launch film, a design
                review and a service manual. We want to help that work carry forward
                into simulation and digital-twin workflows.</p>
            </div>
            <ol className="twin-path">
              <li><span>01 / TODAY</span><h3>Visualize.</h3><p>Prepared scenes, directed motion and reviewed takes.</p></li>
              <li><span>02 / PROPOSED</span><h3>Reuse.</h3><p>Component identities, source revisions and technical documentation.</p></li>
              <li><span>03 / RESEARCH</span><h3>Simulate.</h3><p>Interoperable scenes, physical behavior and validated tests.</p></li>
              <li><span>04 / LONGER TERM</span><h3>Connect.</h3><p>Link a physical asset to maintained operational data.</p></li>
            </ol>
            <div className="twin-footnote"><p>Digital twins extend beyond appearance to behavior and real-world data.
              NVIDIA Omniverse is one ecosystem we are evaluating. Simulation, connected twins and an Omniverse integration are future work.</p>
              <Link className="text-link" href="/perspective">Explore the direction <ArrowUpRight size={17} /></Link></div>
          </div>
        </section>
        <section id="ways" className="offers wrap section">
          <div className="section-head">
            <p className="eyebrow">THREE WAYS TO WORK</p>
            <h2>Choose your level of support.</h2>
            <p>
              Direct it yourself, commission a film or bring us into the design.
            </p>
          </div>
          <div className="offer-grid three-tiers">
            {[
              {
                name: "Studio",
                tag: "SELF-DIRECTED",
                title: "Your next animation.",
                price: "$49",
                unit: "CAD / month · proposed",
                copy: "Prepare scenes, compare takes and deliver your own work.",
                items: [
                  "Blender-connected workflow",
                  "Source review and take records",
                  "Synchronized video comparison",
                  "Source-linked project records",
                ],
                terms: "Early access. Generation usage is separate.",
                cta: "Open studio",
                href: "/studio",
              },
              {
                name: "Production",
                tag: "EXPERT-ASSISTED",
                title: "A finished film.",
                price: "From $1,500",
                unit: "CAD / project · proposed",
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
                tag: "HANDS-ON REVIEW",
                title: "Work through the details.",
                price: "$750",
                unit: "CAD / review · proposed",
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
                <div className="offer-label">
                  {tier.name}
                  <span>{tier.tag}</span>
                </div>
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
            Pricing preview · Packages are being tested during early access.
            Subscriptions and service checkout are planned. Open Studio to explore the working prototype.
          </p>
        </section>
        <section id="agents" className="agent-section section">
          <div className="wrap agent-grid">
            <div>
              <p className="eyebrow">WORK FROM CHAT</p>
              <h2>
                Prepare. Review.
                <br />
                Approve.
              </h2>
              <p>
                Ask an agent to prepare a Blender render, bring it into the
                workspace and assemble a generation request. Review the source
                and settings before approving a paid job.
              </p>
              <Link href="/studio" className="text-link">
                Open studio <ArrowRight size={17} />
              </Link>
            </div>
            <div className="agent-console">
              <div className="console-top">
                <span className="live-dot" /> BLACKBLEND / MCP{" "}
                <span>AVAILABLE NOW</span>
              </div>
              <div className="tool-row">
                <span>01</span>
                <code>create_brief</code>
                <span>Capture intent</span>
              </div>
              <div className="tool-row">
                <span>02</span>
                <code>plan_brief</code>
                <span>Prepare preflight</span>
              </div>
              <div className="tool-row">
                <span>03</span>
                <code>get_brief</code>
                <span>Keep context</span>
              </div>
              <p>Human approval before paid generation.</p>
              <small>
                Studio keeps your scene, animation and reviews together. Hosted
                tools handle scene proposals, a native window edit and approved video generation.
                Detailed Blender authoring can also run on your computer.
              </small>
            </div>
          </div>
        </section>
        <section className="faq wrap section">
          <div>
            <p className="eyebrow">PRACTICAL DETAILS</p>
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
                "Design agencies, independent practitioners and product teams working from CAD. We also help teams bringing AI and agents into design workflows.",
              ],
              [
                "How is work priced?",
                "We are developing Studio subscriptions, Production projects and Engineering & Design reviews. Project quotes will specify deliverables, revisions and generation costs.",
              ],
              [
                "Does Blackblend build digital twins?",
                "Our current prototype focuses on visualization and review. Revision-linked assets, simulation and physical-system data are longer-term directions. A generated film alone does not establish a validated digital twin.",
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
          <p className="eyebrow">YOUR NEXT PROJECT</p>
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
        <p>Design practice. Software. Shared knowledge.</p>
        <span>© {new Date().getFullYear()} Blackblend · Early access</span>
      </footer>
    </>
  );
}
