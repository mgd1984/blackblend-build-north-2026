import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
export const briefs = sqliteTable(
  "briefs",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    requestId: text("request_id").notNull(),
    title: text("title").notNull(),
    track: text("track").notNull(),
    audience: text("audience").notNull(),
    goal: text("goal").notNull(),
    source: text("source").notNull(),
    fidelity: text("fidelity").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("brief_owner_request").on(table.owner, table.requestId)],
);

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  briefId: text("brief_id").notNull(),
  status: text("status").notNull(),
  revision: text("revision").notNull(),
  metadata: text("metadata").notNull(),
  sourceHash: text("source_hash"),
  proofKey: text("proof_key"),
  sourceKey: text("source_key"),
  resultKey: text("result_key"),
  prompt: text("prompt").notNull(),
  quality: text("quality").notNull(),
  localProposal: text("local_proposal"),
  jobId: text("job_id"),
  generationId: text("generation_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const scenes = sqliteTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    title: text("title").notNull(),
    version: integer("version").notNull(),
    document: text("document").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("scene_owner_updated").on(table.owner, table.updatedAt)],
);

export const generationJobs = sqliteTable(
  "generation_jobs",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    workflowId: text("workflow_id").notNull(),
    requestId: text("request_id").notNull(),
    inputHash: text("input_hash").notNull(),
    input: text("input").notNull(),
    status: text("status").notNull(),
    remoteId: text("remote_id"),
    error: text("error"),
    durationMs: integer("duration_ms").notNull(),
    baseEstimateCents: integer("base_estimate_cents").notNull(),
    resultKey: text("result_key"),
    processingMs: integer("processing_ms"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    approvedAt: text("approved_at"),
    updatedAt: text("updated_at").notNull(),
    pollAfter: integer("poll_after").notNull().default(0),
  },
  (table) => [
    uniqueIndex("generation_owner_request").on(table.owner, table.requestId),
    index("generation_owner_approved").on(table.owner, table.approvedAt),
  ],
);
export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
  deliveredAt: text("delivered_at"),
  deliveryAttempts: integer("delivery_attempts").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at").notNull().default(0),
  deliveryError: text("delivery_error"),
});

export const agentRequests = sqliteTable(
  "agent_requests",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    requestId: text("request_id").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status").notNull(),
    reply: text("reply"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("agent_owner_request").on(table.owner, table.requestId),
    index("agent_owner_created").on(table.owner, table.createdAt),
  ],
);

export const billingAccounts = sqliteTable(
  "billing_accounts",
  {
    owner: text("owner").primaryKey(),
    environment: text("environment").notNull(),
    stripeAccountId: text("stripe_account_id").notNull(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    metronomeCustomerId: text("metronome_customer_id").notNull(),
    metronomeContractId: text("metronome_contract_id").notNull(),
    usageConfigured: integer("usage_configured").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("billing_stripe_customer").on(table.stripeAccountId, table.stripeCustomerId),
    uniqueIndex("billing_metronome_customer").on(table.metronomeCustomerId),
    uniqueIndex("billing_metronome_contract").on(table.metronomeContractId),
  ],
);

export const billingNotifications = sqliteTable(
  "billing_notifications",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    owner: text("owner").notNull(),
    payload: text("payload").notNull(),
    receivedAt: text("received_at").notNull(),
    processedAt: text("processed_at"),
  },
  (table) => [
    uniqueIndex("billing_notification_event").on(table.provider, table.eventId),
    index("billing_notification_owner").on(table.owner, table.receivedAt),
  ],
);

export const billingDispatchLeases = sqliteTable("billing_dispatch_leases", {
  id: text("id").primaryKey(),
  token: text("token").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const nativeGeometry = sqliteTable(
  "native_geometry",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    requestId: text("request_id").notNull(),
    inputHash: text("input_hash").notNull(),
    input: text("input").notNull(),
    status: text("status").notNull(),
    document: text("document"),
    report: text("report"),
    error: text("error"),
    executionMs: integer("execution_ms"),
    providerReceipt: text("provider_receipt"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("native_geometry_owner_request").on(table.owner, table.requestId),
    index("native_geometry_owner_created").on(table.owner, table.createdAt),
  ],
);
