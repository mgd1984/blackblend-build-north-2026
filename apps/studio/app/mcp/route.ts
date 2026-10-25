import { requestOwner } from "../../lib/identity";
import { z } from "zod";
import { actWorkflow, listWorkflows } from "../../lib/workflow-store";
import { createBrief, getBrief, listBriefs } from "../../lib/brief-store";
import { planFor } from "../../lib/briefs";
import { readJsonBounded, RequestBodyError } from "../../lib/request-body";
export const dynamic = "force-dynamic";
const empty = { type: "object", properties: {}, additionalProperties: false };
const idSchema = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
  additionalProperties: false,
};
const tools = [
  {
    name: "blackblend_list_render_workflows",
    description:
      "Read the signed-in user's render previews, review progress and prepared generation settings. Media links require that same user's signed-in browser.",
    inputSchema: empty,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "blackblend_render_workflow_action",
    description:
      "Prepare or update a Blender render job. prepare_render returns instructions for a local agent; request_generation only saves settings for approval. A person must approve hosted generation in Studio or desktop generation on its local approval page. This MCP tool cannot submit a paid job.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          enum: [
            "create",
            "prepare_render",
            "review_render",
            "request_generation",
            "record_submission",
            "link_local_approval",
          ],
        },
        id: { type: "string", format: "uuid" },
        briefId: { type: "string", format: "uuid" },
        prompt: { type: "string", minLength: 1, maxLength: 12000 },
        quality: { enum: ["480P", "768P", "1080P"] },
        sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        proposalId: { type: "string", format: "uuid" },
        jobId: { type: "string", pattern: "^run-[A-Za-z0-9_-]+$" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },

  {
    name: "blackblend_capabilities",
    description:
      "Read what Blackblend can do now, its offers, and the hosted/local boundary.",
    inputSchema: empty,
    annotations: { readOnlyHint: true },
  },
  {
    name: "blackblend_list_briefs",
    description:
      "List up to 50 project briefs owned by the authenticated caller.",
    inputSchema: empty,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "blackblend_get_brief",
    description: "Read one of your project briefs.",
    inputSchema: idSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "blackblend_create_brief",
    description:
      "Save a project brief for the authenticated caller. Use a stable UUID requestId for idempotent retry. Does not book work, spend money, upload CAD or run rendering.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", format: "uuid" },
        title: { type: "string", minLength: 2, maxLength: 120 },
        track: { enum: ["studio", "directed"] },
        audience: { type: "string", minLength: 2, maxLength: 200 },
        goal: { type: "string", minLength: 10, maxLength: 4000 },
        source: { enum: ["blender", "cad", "video", "none"] },
        fidelity: { enum: ["native", "appearance"] },
      },
      required: [
        "requestId",
        "title",
        "track",
        "audience",
        "goal",
        "source",
        "fidelity",
      ],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "blackblend_plan_brief",
    description:
      "Read a saved brief and return a deterministic preflight workflow and approval gates. Does not launch paid jobs or operate Blender.",
    inputSchema: idSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
];
export const capabilities = {
  available: [
    "Project briefs saved per signed-in user",
    "Preflight planning via MCP",
    "Prepare Blender renders, review the exact source, request local approval and compare source/result videos",
    "Interactive scene editing, choreography and browser MP4 capture in Studio",
    "Operator-restricted hosted scene proposals, native Blender window edits and human-approved fal video jobs in Studio",
    "Optional desktop adapter for local Blender authoring and approved provider jobs",
  ],
  notYetHosted: [
    "Arbitrary Blender scripting",
    "CAD upload",
    "Commercial customer billing",
    "client approvals",
  ],
  offers: [
    "Studio: hands-on workspace, early access",
    "Directed: expert-assisted project delivery, scope and quote agreed separately",
  ],
  paidActions: false,
};
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  let id: unknown = null;
  try {
    const body = await readJsonBounded(request, 20000, { requireJson: false }) as {
      id?: unknown; jsonrpc?: string; method?: string;
      params?: { name?: string; arguments?: unknown };
    };
    id = body.id ?? null;
    const reply = (result: unknown) =>
      Response.json({ jsonrpc: "2.0", id, result }, { headers });
    if (body.jsonrpc !== "2.0") throw new Error("Invalid JSON-RPC.");
    if (body.method === "server/discover")
      return reply({
        supportedVersions: ["2026-07-28"],
        capabilities: { tools: {} },
      });
    if (body.method === "initialize")
      return reply({
        protocolVersion: "2026-07-28",
        capabilities: { tools: {} },
        serverInfo: { name: "blackblend", version: "0.1.0" },
      });
    if (body.method === "notifications/initialized")
      return new Response(null, { status: 204 });
    if (body.method === "tools/list") return reply({ tools });
    if (body.method !== "tools/call")
      return Response.json(
        {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Method not found" },
        },
        { headers },
      );
    let result: unknown;
    const name = body.params?.name,
      args = body.params?.arguments ?? {};
    if (name === "blackblend_capabilities") {
      z.object({}).strict().parse(args);
      result = capabilities;
    } else {
      // Match requestOwner's credential selection: a bearer token never falls back to cookies.
      if (!request.headers.get("authorization")?.startsWith("Bearer ") &&
          request.headers.get("origin") !== new URL(request.url).origin)
        return Response.json({ error: "Invalid origin." }, { status: 403, headers });
      const owner = await requestOwner(request);
      if (!owner) throw new Error("Sign in to access your briefs.");
      if (name === "blackblend_list_render_workflows") {
        z.object({}).strict().parse(args);
        result = await listWorkflows(owner);
      } else if (name === "blackblend_render_workflow_action")
        result = await actWorkflow(owner, args);
      else if (name === "blackblend_create_brief")
        result = await createBrief(owner, args);
      else if (name === "blackblend_list_briefs") {
        z.object({}).strict().parse(args);
        result = await listBriefs(owner);
      } else if (
        name === "blackblend_get_brief" ||
        name === "blackblend_plan_brief"
      ) {
        const { id: key } = z
          .object({ id: z.string().uuid() })
          .strict()
          .parse(args);
        const brief = await getBrief(owner, key);
        result =
          name === "blackblend_get_brief"
            ? brief
            : planFor(brief as Parameters<typeof planFor>[0]);
      } else throw new Error("Unknown tool.");
    }
    return reply({ content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (error) {
    if (error instanceof RequestBodyError && error.status === 413)
      return new Response("Request too large", { status: 413, headers });
    const message =
      error instanceof Error && error.name === "ZodError"
        ? "Invalid tool arguments."
        : error instanceof Error &&
            [
              "Sign in to access your briefs.",
              "Brief not found.",
              "Unknown tool.",
              "Invalid JSON-RPC.",
              "This request ID was already used with different brief fields. Use a new request ID for a new brief.",
            ].includes(error.message)
          ? error.message
          : "The operation could not complete. Read back state before retrying with the same requestId.";
    return Response.json(
      {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: message }], isError: true },
      },
      { headers },
    );
  }
}
