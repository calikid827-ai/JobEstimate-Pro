import AppKit
import Foundation
import PDFKit

struct PageRecord: Codable {
    let sourcePageNumber: Int
    let width: Int?
    let height: Int?
    let text: String?
    let imageFile: String?
}

struct RenderResult: Codable {
    let pageCount: Int
    let pages: [PageRecord]
}

func normalizeText(_ value: String?) -> String? {
    guard let value else { return nil }
    let collapsed = value
        .replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
        .split(separator: "\n")
        .map { $0.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression) }
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .prefix(40)
        .joined(separator: "\n")

    return collapsed.isEmpty ? nil : String(collapsed.prefix(4000))
}

func renderPage(page: PDFPage, sourcePageNumber: Int, outputDir: URL, shouldRenderImage: Bool) throws -> PageRecord {
    let bounds = page.bounds(for: .mediaBox)
    let maxDimension: CGFloat = 1400
    let scale = min(2.0, max(0.35, maxDimension / max(bounds.width, bounds.height, 1)))
    let renderSize = NSSize(
        width: max(1, floor(bounds.width * scale)),
        height: max(1, floor(bounds.height * scale))
    )

    var imageFile: String? = nil

    if shouldRenderImage {
        let image = NSImage(size: renderSize)
        image.lockFocus()

        let fillRect = NSRect(origin: .zero, size: renderSize)
        NSColor.white.set()
        NSBezierPath(rect: fillRect).fill()

        if let context = NSGraphicsContext.current?.cgContext {
            context.saveGState()
            context.translateBy(x: 0, y: renderSize.height)
            context.scaleBy(x: scale, y: -scale)
            page.draw(with: .mediaBox, to: context)
            context.restoreGState()
        }

        image.unlockFocus()

        if let tiff = image.tiffRepresentation,
           let rep = NSBitmapImageRep(data: tiff),
           let png = rep.representation(using: .png, properties: [:]) {
            let filename = "page-\(sourcePageNumber).png"
            let destination = outputDir.appendingPathComponent(filename)
            try png.write(to: destination)
            imageFile = filename
        }
    }

    return PageRecord(
        sourcePageNumber: sourcePageNumber,
        width: Int(bounds.width.rounded()),
        height: Int(bounds.height.rounded()),
        text: normalizeText(page.string),
        imageFile: imageFile
    )
}

let args = CommandLine.arguments
guard args.count >= 4 else {
    fputs("usage: render_pdf_pages.swift <input-pdf> <output-dir> <selected-pages-csv>\n", stderr)
    exit(2)
}

let pdfURL = URL(fileURLWithPath: args[1])
let outputDir = URL(fileURLWithPath: args[2], isDirectory: true)
let selectedPagesArg = args[3].trimmingCharacters(in: .whitespacesAndNewlines)
let selectedPages: Set<Int>? =
    selectedPagesArg.isEmpty
    ? nil
    : Set(
        selectedPagesArg
            .split(separator: ",")
            .compactMap { Int($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
            .filter { $0 > 0 }
    )

try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

guard let document = PDFDocument(url: pdfURL) else {
    fputs("could not open pdf\n", stderr)
    exit(1)
}

var pages: [PageRecord] = []
pages.reserveCapacity(document.pageCount)

for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else { continue }
    let pageNumber = index + 1
    let record = try renderPage(
        page: page,
        sourcePageNumber: pageNumber,
        outputDir: outputDir,
        shouldRenderImage: selectedPages?.contains(pageNumber) ?? true
    )
    pages.append(record)
}

let result = RenderResult(pageCount: document.pageCount, pages: pages)
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
let data = try encoder.encode(result)
FileHandle.standardOutput.write(data)
