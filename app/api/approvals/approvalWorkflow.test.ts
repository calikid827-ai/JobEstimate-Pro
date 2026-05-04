import assert from "node:assert/strict"
import test from "node:test"

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"
process.env.NEXT_PUBLIC_SITE_URL ||= "https://jobestimatepro.test"

type QueryCall = {
  table: string
  action: string
  payload?: unknown
  filters: Array<{ method: string; key: string; value: unknown }>
  terminal: string
}

class SupabaseQueryMock {
  private action = "select"
  private payload: unknown
  private filters: Array<{ method: string; key: string; value: unknown }> = []
  private table: string
  private calls: QueryCall[]
  private resolveCall: (call: QueryCall) => unknown

  constructor(
    table: string,
    calls: QueryCall[],
    resolveCall: (call: QueryCall) => unknown
  ) {
    this.table = table
    this.calls = calls
    this.resolveCall = resolveCall
  }

  select() {
    return this
  }

  insert(payload: unknown) {
    this.action = "insert"
    this.payload = payload
    return this
  }

  upsert(payload: unknown) {
    this.action = "upsert"
    this.payload = payload
    return this
  }

  update(payload: unknown) {
    this.action = "update"
    this.payload = payload
    return this
  }

  eq(key: string, value: unknown) {
    this.filters.push({ method: "eq", key, value })
    return this
  }

  in(key: string, value: unknown) {
    this.filters.push({ method: "in", key, value })
    return this
  }

  order() {
    return this
  }

  limit() {
    return this
  }

  maybeSingle() {
    return Promise.resolve(this.finish("maybeSingle"))
  }

  single() {
    return Promise.resolve(this.finish("single"))
  }

  then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
    Promise.resolve(this.finish("await")).then(resolve, reject)
  }

  private finish(terminal: string) {
    const call = {
      table: this.table,
      action: this.action,
      payload: this.payload,
      filters: this.filters,
      terminal,
    }
    this.calls.push(call)
    return this.resolveCall(call)
  }
}

function makeSupabaseMock(resolveCall: (call: QueryCall) => unknown) {
  const calls: QueryCall[] = []
  return {
    calls,
    client: {
      from(table: string) {
        return new SupabaseQueryMock(table, calls, resolveCall)
      },
    },
  }
}

const estimateSnapshot = {
  id: "estimate_1",
  createdAt: 1_700_000_000_000,
  jobId: "job_1",
  documentType: "Estimate",
  jobDetails: {
    clientName: "Jane Client",
    jobName: "Lobby Refresh",
    jobAddress: "123 Main",
    date: "2026-05-01",
  },
  result: "Paint lobby walls and replace selected fixtures.",
  pricing: {
    labor: 1000,
    materials: 500,
    subs: 0,
    markup: 20,
    total: 1800,
  },
  schedule: null,
  tax: null,
  deposit: null,
  estimateRows: [{ label: "Internal row", amount: 1000 }],
  estimateEmbeddedBurdens: [{ label: "Internal burden", amount: 50 }],
  estimateSections: [{ label: "Internal section", amount: 1000 }],
  companyProfile: {
    name: "Contractor Co",
    paymentTerms: "Due upon approval",
  },
}

test("POST /api/approvals reuses an existing proposal for the same owner and local estimate", async () => {
  const { handleApprovalSnapshotPost } = await import("./route")
  const { client, calls } = makeSupabaseMock((call) => {
    if (
      call.table === "estimate_proposals" &&
      call.action === "select" &&
      call.terminal === "maybeSingle"
    ) {
      return { data: { id: "proposal_existing" }, error: null }
    }
    if (call.table === "approval_owner_sync_tokens" && call.action === "upsert") {
      return { error: null }
    }
    if (call.table === "approval_links" && call.action === "insert") {
      return { error: null }
    }
    return { data: null, error: null }
  })

  const res = await handleApprovalSnapshotPost(
    new Request("https://jobestimatepro.test/api/approvals", {
      method: "POST",
      body: JSON.stringify({
        email: "OWNER@EXAMPLE.COM",
        estimate: estimateSnapshot,
        companyProfile: estimateSnapshot.companyProfile,
      }),
    }),
    client as any
  )
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.equal(body.proposalId, "proposal_existing")
  assert.match(body.approvalUrl, /^https:\/\/jobestimatepro\.test\/approve\//)
  assert.equal(typeof body.ownerSyncToken, "string")
  assert.equal(
    calls.some((call) => call.table === "estimate_proposals" && call.action === "insert"),
    false
  )
  assert.equal(
    calls.some(
      (call) =>
        call.table === "approval_links" &&
        call.action === "insert" &&
        (call.payload as any)?.proposal_id === "proposal_existing"
    ),
    true
  )
})

test("GET /api/approvals/[token] returns a minimized public proposal payload", async () => {
  const { handlePublicApprovalGet } = await import("./[token]/route")
  const { client } = makeSupabaseMock((call) => {
    if (call.table === "approval_links" && call.action === "select") {
      return {
        data: { proposal_id: "proposal_1", status: "active", expires_at: null },
        error: null,
      }
    }
    if (call.table === "estimate_proposals" && call.action === "select") {
      return {
        data: {
          id: "proposal_1",
          status: "pending",
          estimate_snapshot: estimateSnapshot,
        },
        error: null,
      }
    }
    return { data: null, error: null }
  })

  const res = await handlePublicApprovalGet(
    new Request("https://jobestimatepro.test/api/approvals/token_1"),
    { params: Promise.resolve({ token: "token_1" }) },
    client as any
  )
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.equal(body.estimate.id, "estimate_1")
  assert.equal("estimateRows" in body.estimate, false)
  assert.equal("estimateEmbeddedBurdens" in body.estimate, false)
  assert.equal("estimateSections" in body.estimate, false)
})

test("POST /api/approvals/[token]/approve is idempotent when already approved", async () => {
  const { handleApprovalSubmitPost } = await import("./[token]/approve/route")
  const { client, calls } = makeSupabaseMock((call) => {
    if (call.table === "approval_links" && call.action === "select") {
      return {
        data: { proposal_id: "proposal_1", status: "active", expires_at: null },
        error: null,
      }
    }
    if (call.table === "estimate_proposals" && call.action === "select") {
      return {
        data: {
          id: "proposal_1",
          status: "approved",
          owner_email: "owner@example.com",
          local_estimate_id: "estimate_1",
          local_job_id: "job_1",
          estimate_snapshot: estimateSnapshot,
        },
        error: null,
      }
    }
    if (call.table === "approval_invoices" && call.action === "select") {
      return { data: { invoice_snapshot: { id: "invoice_existing" } }, error: null }
    }
    if (call.table === "proposal_approvals" && call.action === "select") {
      return {
        data: {
          id: "approval_existing",
          approved_by: "Jane Client",
          approved_at: "2026-05-01T12:00:00.000Z",
          signature_data_url: "data:image/png;base64,abc",
        },
        error: null,
      }
    }
    return { data: null, error: null }
  })

  const res = await handleApprovalSubmitPost(
    new Request("https://jobestimatepro.test/api/approvals/token_1/approve", {
      method: "POST",
      body: JSON.stringify({
        approvedBy: "Jane Client",
        signatureDataUrl: "data:image/png;base64,new",
      }),
    }),
    { params: Promise.resolve({ token: "token_1" }) },
    client as any
  )
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.equal(body.status, "approved")
  assert.equal(body.alreadyApproved, true)
  assert.deepEqual(body.invoice, { id: "invoice_existing" })
  assert.equal(
    calls.some((call) => call.table === "proposal_approvals" && call.action === "insert"),
    false
  )
  assert.equal(
    calls.some((call) => call.table === "approval_invoices" && call.action === "insert"),
    false
  )
})

test("POST /api/approvals/[token]/approve returns existing invoice on duplicate invoice insert", async () => {
  const { handleApprovalSubmitPost } = await import("./[token]/approve/route")
  let invoiceReadCount = 0
  const { client } = makeSupabaseMock((call) => {
    if (call.table === "approval_links" && call.action === "select") {
      return {
        data: { proposal_id: "proposal_1", status: "active", expires_at: null },
        error: null,
      }
    }
    if (call.table === "estimate_proposals" && call.action === "select") {
      return {
        data: {
          id: "proposal_1",
          status: "pending",
          owner_email: "owner@example.com",
          local_estimate_id: "estimate_1",
          local_job_id: "job_1",
          estimate_snapshot: estimateSnapshot,
        },
        error: null,
      }
    }
    if (call.table === "proposal_approvals" && call.action === "insert") {
      return {
        data: {
          id: "approval_1",
          approved_by: "Jane Client",
          approved_at: "2026-05-01T12:00:00.000Z",
          signature_data_url: "data:image/png;base64,abc",
        },
        error: null,
      }
    }
    if (call.table === "estimate_proposals" && call.action === "update") {
      return { error: null }
    }
    if (call.table === "approval_invoices" && call.action === "select") {
      invoiceReadCount += 1
      return invoiceReadCount === 1
        ? { data: null, error: null }
        : { data: { invoice_snapshot: { id: "invoice_existing" } }, error: null }
    }
    if (call.table === "approval_invoices" && call.action === "insert") {
      return { error: { code: "23505", message: "duplicate key value violates unique constraint" } }
    }
    return { data: null, error: null }
  })

  const res = await handleApprovalSubmitPost(
    new Request("https://jobestimatepro.test/api/approvals/token_1/approve", {
      method: "POST",
      body: JSON.stringify({
        approvedBy: "Jane Client",
        signatureDataUrl: "data:image/png;base64,abc",
      }),
    }),
    { params: Promise.resolve({ token: "token_1" }) },
    client as any
  )
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.equal(body.status, "approved")
  assert.equal(body.invoiceCreated, false)
  assert.deepEqual(body.invoice, { id: "invoice_existing" })
})

test("GET /api/approvals/status rejects missing owner sync token before data lookup", async () => {
  const { handleApprovalStatusGet } = await import("./status/route")
  const { client, calls } = makeSupabaseMock(() => {
    throw new Error("Supabase should not be called without ownerSyncToken")
  })

  const res = await handleApprovalStatusGet(
    new Request("https://jobestimatepro.test/api/approvals/status?email=owner@example.com"),
    client as any
  )
  const body = await res.json()

  assert.equal(res.status, 400)
  assert.equal(body.error, "Email and owner sync token are required.")
  assert.equal(calls.length, 0)
})
