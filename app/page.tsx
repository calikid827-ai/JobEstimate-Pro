"use client"

import Link from "next/link"

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 900,
        margin: "80px auto",
        padding: 32,
        fontFamily: "system-ui",
      }}
    >
      {/* HERO */}
      <section style={{ marginBottom: 64 }}>
        <h1 style={{ fontSize: 36, marginBottom: 12 }}>
          Create professional change orders & estimates in seconds — ready to print and sign.
        </h1>

        <p style={{ fontSize: 18, color: "#555", maxWidth: 720 }}>
          No setup. No templates. Just enter the scope and get a clean, professional PDF your client can approve.
        </p>

        <div style={{ marginTop: 24 }}>
          <Link href="/app">
            <button
              style={{
                padding: "14px 22px",
                fontSize: 16,
                background: "#000",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Generate a Change Order
            </button>
          </Link>

          <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
            Free to try — no credit card required
          </p>
        </div>
      </section>

      {/* SCREENSHOT PLACEHOLDER */}
      <section style={{ marginBottom: 64 }}>
        <div
  style={{
    marginTop: 24,
    background: "#f3f4f6",
    borderRadius: 16,
    padding: 16,
  }}
>
  <img
    src="/screenshot.png"
    alt="Example of a print-ready change order generated in seconds"
    style={{
      width: "100%",
      borderRadius: 12,
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    }}
  />
</div>

        <p style={{ fontSize: 13, color: "#666" }}>
          Example of a print-ready change order generated in seconds.
        </p>
      </section>

      {/* WHY */}
      <section style={{ marginBottom: 64 }}>
        <h2>Why contractors use JobEstimate Pro</h2>

        <ul style={{ marginTop: 16, lineHeight: 1.6 }}>
          <li>
            <strong>Looks professional</strong><br />
            Clean, print-ready documents that clients take seriously.
          </li>
          <li style={{ marginTop: 12 }}>
            <strong>Saves time</strong><br />
            No formatting, no templates — just describe the work and generate.
          </li>
          <li style={{ marginTop: 12 }}>
            <strong>Helps you get approved faster</strong><br />
            Clear scope, clear pricing, and signature-ready PDFs.
          </li>
        </ul>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ marginBottom: 64 }}>
        <h2>How it works</h2>

        <ol style={{ marginTop: 16, lineHeight: 1.6 }}>
          <li>
            <strong>Enter the scope of work</strong><br />
            Describe the change or additional work in plain language.
          </li>
          <li style={{ marginTop: 12 }}>
            <strong>Review pricing</strong><br />
            Adjust labor, materials, and markup if needed.
          </li>
          <li style={{ marginTop: 12 }}>
            <strong>Download & print</strong><br />
            Get a professional PDF ready for signatures and approval.
          </li>
        </ol>
      </section>

      {/* TRUST */}
      <section style={{ marginBottom: 64 }}>
        <p style={{ fontSize: 16 }}>
          <strong>Built for real contractors</strong> — not accountants or spreadsheets.
        </p>
        <p style={{ fontSize: 14, color: "#666" }}>
          Works on desktop or mobile. No account required to try.
        </p>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid #eee", paddingTop: 24 }}>
        <p style={{ fontSize: 13, color: "#777" }}>
          Professional documents. Real-world jobs. Built to get approved.
        </p>
      </footer>
    </main>
  )
}