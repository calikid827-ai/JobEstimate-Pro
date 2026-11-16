/** Controlled source-replacement exercise. Uses real immutable upload/version APIs. */
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { createProjectLibraryClient, projectFileHash } from "../../app/lib/project-library/client.ts"
const scratch = path.resolve(process.argv[2] || "")
if (!scratch.startsWith("/private/tmp/jobestimate-full-workflow-")) throw Error("Use the isolated synthetic workload.")
const base = fs.readFileSync(path.join(scratch, "local-service-url.txt"), "utf8").trim()
if (new URL(base).protocol !== "http:" || new URL(base).hostname !== "127.0.0.1") throw Error("Only the controlled loopback service is allowed.")
const mode = process.argv[3] ?? "supported"
const names = mode === "supported" ? ["Cedar plan.pdf", "Painting specification.pdf", "Addendum 03.pdf", "Unknown extent.pdf"] : mode === "openings-change" ? ["Addendum 03.pdf"] : (() => { throw Error("Unknown fixture replacement mode.") })()
const transport = (input, init = {}) => fetch(new URL(String(input), base), { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: "Bearer synthetic-project-owner-a" } })
const client = createProjectLibraryClient(transport, "synthetic-project-1", () => true, transport)
const changed = []
for (const name of names) {
  const source = mode === "openings-change" ? path.join(scratch, "supported-sources", "replacement-addendum.pdf") : path.join(scratch, "supported-sources", name)
  const blob = new Blob([fs.readFileSync(source)], { type: "application/pdf" })
  const sha256 = await projectFileHash(blob), relativePath = "AI Review/" + name
  const inventory = (await client.list()).inventory
  const prior = inventory.files.find(file => file.active && file.relativePath === relativePath)
  let file = prior?.sha256 === sha256 ? prior : (await client.register({ name, relativePath, size: blob.size, sha256, mimeType: blob.type, selectionId: randomUUID() })).file
  if (file.status !== "uploaded") await client.upload(blob, file)
  while (file.preparation !== "prepared") {
    const result = await client.prepare(file.id)
    file = result.inventory.files.find(item => item.id === file.id)
    if (["failed", "unsupported"].includes(file.preparation)) throw Error(file.issue)
  }
  changed.push({ relativePath, previousId: prior?.id, fileId: file.id, sourceVersion: file.sourceVersion, sha256: file.sha256, originalRetained: !prior || prior.id === file.id || (await client.list()).inventory.files.some(item => item.id === prior.id && !item.active) })
}
fs.writeFileSync(path.join(scratch, "replacement-" + mode + ".json"), JSON.stringify({ synthetic: true, realTransfers: true, changed }, null, 2) + "\n")
console.log(JSON.stringify(changed, null, 2))
