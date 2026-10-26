import assert from "node:assert/strict"
import test from "node:test"

import {
  classifyStoredSignature,
  pickSyncedSignatureDataUrl,
  renderCustomerSignatureBlockHtml,
} from "../../app/lib/approval-signature"
import { SIGNATURE_MAX_ENCODED_CHARS } from "../../lib/safe-image-data-url"
import { TINY_JPEG_DATA_URL, TINY_PNG_DATA_URL } from "../../../tests/fixtures/images/tiny-images"

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
      headers: { authorization: "Bearer synthetic-valid" },
      body: JSON.stringify({
        email: "OWNER@EXAMPLE.COM",
        estimate: estimateSnapshot,
        companyProfile: estimateSnapshot.companyProfile,
      }),
    }),
    client as any,
    { getUser: async () => ({ data: { user: { id: "owner-1", email: "owner@example.com", email_confirmed_at: "2026-01-01", role: "authenticated" } }, error: null }) }
  )
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.equal(body.proposalId, "proposal_existing")
  assert.match(body.approvalUrl, /^https:\/\/jobestimatepro\.test\/approve\//)
  assert.equal("ownerSyncToken" in body, false)
  assert.equal(calls.some((call) => call.table === "approval_owner_sync_tokens"), false)
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
        signatureDataUrl: TINY_PNG_DATA_URL,
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
        signatureDataUrl: TINY_PNG_DATA_URL,
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

test("GET /api/approvals/status requires a verified session before data lookup", async () => {
  const { handleApprovalStatusGet } = await import("./status/route")
  const { client, calls } = makeSupabaseMock(() => {
    throw new Error("Supabase should not be called without ownerSyncToken")
  })

  const res = await handleApprovalStatusGet(
    new Request("https://jobestimatepro.test/api/approvals/status?email=owner@example.com"),
    client as any
  )
  const body = await res.json()

  assert.equal(res.status, 401)
  assert.equal(body.code, "AUTH_REQUIRED")
  assert.equal(calls.length, 0)
})

const syntheticOwnerAuth = {
  getUser: async () => ({
    data: { user: { id: "owner-1", email: "owner@example.com", email_confirmed_at: "2026-01-01", role: "authenticated" } },
    error: null,
  }),
}

function approveRequest(signatureDataUrl: unknown) {
  return new Request("https://jobestimatepro.test/api/approvals/token_1/approve", {
    method: "POST",
    body: JSON.stringify({ approvedBy: "Jane Client", signatureDataUrl }),
  })
}

test("POST /api/approvals/[token]/approve rejects unreadable signatures before any database call", async () => {
  const { handleApprovalSubmitPost } = await import("./[token]/approve/route")
  const rejected: Array<[string, string]> = [
    ["attribute breakout", 'x" onerror="alert(1)'],
    ["synthetic oversized payload", `data:image/png;base64,${"AAAA".repeat(SIGNATURE_MAX_ENCODED_CHARS / 4 + 1)}`],
    ["real jpeg", TINY_JPEG_DATA_URL],
    ["whitespace-wrapped real png", ` ${TINY_PNG_DATA_URL} `],
  ]

  for (const [name, signatureDataUrl] of rejected) {
    const { client, calls } = makeSupabaseMock(() => {
      throw new Error("The database must not be called for an unreadable signature")
    })
    const res = await handleApprovalSubmitPost(
      approveRequest(signatureDataUrl),
      { params: Promise.resolve({ token: "token_1" }) },
      client as never
    )
    const body = await res.json()

    assert.equal(res.status, 400, name)
    assert.equal(body.error, "Signature could not be read. Please sign again.", name)
    assert.equal(calls.length, 0, name)
  }
})

test("POST /api/approvals/[token]/approve stores a valid PNG signature unchanged", async () => {
  const { handleApprovalSubmitPost } = await import("./[token]/approve/route")
  const { client, calls } = makeSupabaseMock((call) => {
    if (call.table === "approval_links" && call.action === "select") {
      return { data: { proposal_id: "proposal_1", status: "active", expires_at: null }, error: null }
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
      const payload = call.payload as { approved_by: string; approved_at: string; signature_data_url: string }
      return { data: { id: "approval_1", ...payload }, error: null }
    }
    if (call.table === "approval_invoices" && call.action === "select") {
      return { data: { invoice_snapshot: { id: "invoice_existing" } }, error: null }
    }
    return { data: null, error: null }
  })

  const res = await handleApprovalSubmitPost(
    approveRequest(TINY_PNG_DATA_URL),
    { params: Promise.resolve({ token: "token_1" }) },
    client as never
  )

  assert.equal(res.status, 200)
  const insert = calls.find((call) => call.table === "proposal_approvals" && call.action === "insert")
  assert.equal((insert?.payload as { signature_data_url?: string } | undefined)?.signature_data_url, TINY_PNG_DATA_URL)
})

function approvalStatusClient(storedSignature: unknown) {
  return makeSupabaseMock((call) => {
    if (call.table === "estimate_proposals") {
      return { data: [{ id: "proposal_1", local_estimate_id: "estimate_1", status: "approved" }], error: null }
    }
    if (call.table === "proposal_approvals") {
      return {
        data: [{
          proposal_id: "proposal_1",
          approved_by: "Jane Client",
          approved_at: "2026-05-01T12:00:00.000Z",
          signature_data_url: storedSignature,
        }],
        error: null,
      }
    }
    if (call.table === "approval_invoices") return { data: [], error: null }
    return { data: null, error: null }
  })
}

async function readStoredSignatureThroughStatus(storedSignature: unknown) {
  const { handleApprovalStatusGet } = await import("./status/route")
  const { client } = approvalStatusClient(storedSignature)
  const res = await handleApprovalStatusGet(
    new Request("https://jobestimatepro.test/api/approvals/status", {
      headers: { authorization: "Bearer synthetic-valid" },
    }),
    client as never,
    syntheticOwnerAuth
  )
  assert.equal(res.status, 200)
  const body = await res.json()
  return body.approvals[0].signature_data_url as unknown
}

test("GET /api/approvals/status returns stored signatures unchanged (T1 does not filter here)", async () => {
  const malicious = 'x" onerror="alert(1)'
  assert.equal(await readStoredSignatureThroughStatus(malicious), malicious)
  assert.equal(await readStoredSignatureThroughStatus(TINY_PNG_DATA_URL), TINY_PNG_DATA_URL)
  assert.equal(await readStoredSignatureThroughStatus(null), null)
})

test("post-sync: an unreadable stored signature stays unreadable through status, sync, and persistence", async () => {
  const serverValue = await readStoredSignatureThroughStatus('x" onerror="alert(1)')
  const synced = pickSyncedSignatureDataUrl(serverValue, TINY_PNG_DATA_URL)
  const persisted = JSON.parse(JSON.stringify({ signatureDataUrl: synced })).signatureDataUrl
  const state = classifyStoredSignature(persisted)

  assert.deepEqual(state, { kind: "unreadable" })
  const html = renderCustomerSignatureBlockHtml(state)
  assert.equal(html.includes("<img"), false)
  assert.equal(html.includes("onerror"), false)

  const validServerValue = await readStoredSignatureThroughStatus(TINY_PNG_DATA_URL)
  const validPersisted = JSON.parse(
    JSON.stringify({ signatureDataUrl: pickSyncedSignatureDataUrl(validServerValue, undefined) })
  ).signatureDataUrl
  assert.deepEqual(classifyStoredSignature(validPersisted), { kind: "valid", src: TINY_PNG_DATA_URL })
})
