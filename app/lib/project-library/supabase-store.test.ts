import assert from "node:assert/strict"
import test from "node:test"
import { SupabaseProjectLibraryStore } from "./supabase-store"
import { emptyInventory } from "./service"
import type { ProjectFile } from "./types"

type Operation = { table: string; selected: string; filters: Array<[string, unknown]>; range?: [number, number]; order?: string }
const owner = "synthetic-owner", project = "synthetic-project", hash = "a".repeat(64)
function fixture() {
  const file: ProjectFile = { id: "synthetic-file", ownerId: owner, projectId: project, name: "Source.txt", relativePath: "Source.txt", mimeType: "text/plain", size: 42, sha256: hash, sourceVersion: 1, active: true, status: "uploaded", preparation: "prepared", pageCount: 1, pages: [], pageStats: { prepared: 1, failed: 0, textCharacters: 11 }, contentStatus: "not_loaded", createdAt: "2026-11-16", objectKey: `${owner}/${project}/synthetic-file/original` }
  const operations: Operation[] = [], rpcs: Array<{ name: string; args: unknown }> = []
  let revision = 1
  const page = { pageNumber: 1, extraction: "complete", review: "pending", textCharacters: 11 }
  function from(table: string) {
    const operation: Operation = { table, selected: "", filters: [] }
    let single = false
    const query = {
      select(value: string) { operation.selected = value; return query },
      eq(name: string, value: unknown) { operation.filters.push([name, value]); return query },
      order(name: string) { operation.order = name; return query },
      range(start: number, end: number) { operation.range = [start, end]; return query },
      maybeSingle() { single = true; return query },
      then(resolve: (value: { data: unknown; error: null }) => unknown) {
        operations.push(operation)
        const foreign = operation.filters.some(([name, value]) => name === "owner_id" && value !== owner || name === "project_id" && value !== project)
        let data: unknown = foreign ? single ? null : [] : table === "project_library_heads" ? { revision, file_count: 1 }
          : table === "project_library_files" ? { file_id: file.id, source_version: 1, source_sha256: hash, active: true, metadata: file }
            : table === "project_library_pages" ? { page_number: 1, source_version: 1, source_sha256: hash, metadata: page, ...(operation.selected.includes("text_content") ? { text_content: "SOURCE TEXT" } : {}) } : null
        if (!single && data && !Array.isArray(data)) data = [data]
        return Promise.resolve({ data, error: null }).then(resolve)
      },
    }
    return query
  }
  const client = { from, rpc: async (name: string, args?: unknown) => { rpcs.push({ name, args }); if (name === "project_library_save_files") revision++; return { data: name === "project_library_ready" ? 2 : revision, error: null } } }
  return { store: new SupabaseProjectLibraryStore(client as never), operations, rpcs, file }
}

test("real production adapter uses owner/project-filtered bounded queries without inventory text or snapshots", async () => {
  const { store, operations, file } = fixture()
  const result = await store.list(owner, project, { limit: 1 })
  assert.equal(result.inventory.files[0].id, file.id)
  assert.equal(result.inventory.files[0].pages.length, 0)
  assert.equal(result.totalFiles, 1)
  const files = operations.filter(operation => operation.table === "project_library_files")
  assert.equal(files.length, 1)
  assert.deepEqual(files[0].range, [0, 0])
  assert.equal(files[0].order, "file_id")
  assert.ok(operations.every(operation => operation.filters.some(([name, value]) => name === "owner_id" && value === owner) && operation.filters.some(([name, value]) => name === "project_id" && value === project)))
  assert.ok(operations.every(operation => !operation.selected.includes("text_content") && !operation.selected.includes("snapshot")))
})

test("real production content adapter selects only the exact original's page text and keeps metadata separate", async () => {
  const { store, operations } = fixture()
  const source = await store.getFile(owner, project, "synthetic-file")
  assert.equal(source?.pages[0].text, "")
  assert.equal(source?.pages[0].contentLoaded, false)
  assert.ok(operations.every(operation => !operation.selected.includes("text_content")))
  const content = await store.getPage(owner, project, "synthetic-file", 1)
  assert.equal(content?.text, "SOURCE TEXT")
  const exact = operations.filter(operation => operation.selected.includes("text_content"))
  assert.equal(exact.length, 1)
  assert.deepEqual(exact[0].filters, [["owner_id", owner], ["project_id", project], ["file_id", "synthetic-file"], ["page_number", 1]])
  const metadata = operations.filter(operation => operation.table === "project_library_pages" && !operation.selected.includes("text_content"))
  assert.ok(metadata.every(operation => operation.range && operation.range[1] - operation.range[0] < 100))
})

test("whole-inventory production writes fail and normalized mutations send only changed file/page rows", async () => {
  const { store, rpcs, file } = fixture()
  await assert.rejects(store.save(), /Whole-inventory writes/)
  const value = { ...file, pages: [{ pageNumber: 1, text: "SOURCE TEXT", extraction: "complete" as const, review: "pending" as const, contentLoaded: true }] }
  await store.saveFiles(owner, project, [value], 1)
  const write = rpcs.find(call => call.name === "project_library_save_files")!
  assert.deepEqual(write.args, { p_owner: owner, p_project: project, p_expected: 1, p_files: [value] })
  assert.ok(!rpcs.some(call => call.name === "project_library_save"))
  await assert.rejects(store.saveFiles(owner, project, [value, value, value], 1), /one file/)
  assert.equal((await store.get("foreign-owner", project)).files.length, emptyInventory("foreign-owner", project).files.length)
})
