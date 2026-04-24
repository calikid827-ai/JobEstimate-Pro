import Foundation
import PDFKit

struct ResultPayload: Encodable {
  let outputPdfPath: String
  let outputBytes: Int
  let sourcePageNumberMap: [Int]
}

func writeResult(_ payload: ResultPayload) throws {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
  let data = try encoder.encode(payload)
  FileHandle.standardOutput.write(data)
}

let args = CommandLine.arguments
guard args.count >= 4 else {
  fputs("Usage: export_pdf_pages.swift <input-pdf> <output-pdf> <selected-pages-csv>\n", stderr)
  exit(1)
}

let inputPath = args[1]
let outputPath = args[2]
let selectedPagesCsv = args[3]

guard let document = PDFDocument(url: URL(fileURLWithPath: inputPath)) else {
  fputs("Could not open PDF\n", stderr)
  exit(2)
}

let selectedPages = selectedPagesCsv
  .split(separator: ",")
  .compactMap { Int($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
  .filter { $0 > 0 }

if selectedPages.isEmpty {
  fputs("No pages selected\n", stderr)
  exit(3)
}

let outputDoc = PDFDocument()
var outputIndex = 0
var sourcePageNumberMap: [Int] = []

for pageNumber in selectedPages {
  guard let page = document.page(at: pageNumber - 1) else { continue }
  outputDoc.insert(page, at: outputIndex)
  outputIndex += 1
  sourcePageNumberMap.append(pageNumber)
}

let outputUrl = URL(fileURLWithPath: outputPath)
guard outputDoc.write(to: outputUrl) else {
  fputs("Could not write selected-pages PDF\n", stderr)
  exit(4)
}

let attrs = try FileManager.default.attributesOfItem(atPath: outputPath)
let bytes = (attrs[.size] as? NSNumber)?.intValue ?? 0

try writeResult(
  ResultPayload(
    outputPdfPath: outputPath,
    outputBytes: bytes,
    sourcePageNumberMap: sourcePageNumberMap
  )
)
