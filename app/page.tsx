"use client"

import Link from "next/link"

const sectionStyle = {
  marginTop: 56,
  paddingTop: 26,
  borderTop: "1px solid #eee",
}

const cardStyle = {
  padding: 18,
  border: "1px solid #eee",
  borderRadius: 16,
  background: "#fff",
}

const buttonStyle = {
  padding: "14px 18px",
  fontSize: 16,
  background: "#000",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 900,
  boxShadow: "0 14px 30px rgba(0,0,0,0.16)",
}

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 980,
        margin: "70px auto",
        padding: "0 22px 80px",
        fontFamily:
          'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
        color: "#0b0b0b",
      }}
    >
      {/* TOP BAR */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          padding: "10px 0 26px",
        }}
      >
        <div
          style={{
            fontWeight: 900,
            letterSpacing: "-0.3px",
            lineHeight: 1.1,
          }}
        >
          JobEstimate <span style={{ color: "#111" }}>Pro</span>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#666" }}>
            Built for real contractors
          </span>
          <Link href="/app">
            <button
              style={{
                padding: "10px 14px",
                fontSize: 14,
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Open App
            </button>
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section
        style={{
          padding: "38px 26px",
          borderRadius: 22,
          border: "1px solid #e7e7e7",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.025), rgba(0,0,0,0.00))",
          boxShadow: "0 18px 40px rgba(0,0,0,0.06)",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(38px, 7vw, 72px)",
            margin: "0 0 16px",
            lineHeight: 0.98,
            letterSpacing: "-1.7px",
            fontWeight: 950,
          }}
        >
          Stop Underbidding Jobs.
          <br />
          Send Professional Estimates Faster.
        </h1>

        <p
          style={{
            fontSize: 18,
            color: "#444",
            maxWidth: 780,
            margin: "0 auto",
            lineHeight: 1.55,
          }}
        >
          Create estimates, change orders, approval links, and invoices from
          simple job scopes — with built-in PriceGuard™ checks to help flag
          missing scope and low pricing risks before you send.
        </p>

        <div
          style={{
            marginTop: 24,
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link href="/app">
            <button style={buttonStyle}>Start Free</button>
          </Link>

          <a href="#how-it-works" style={{ textDecoration: "none" }}>
            <button
              style={{
                padding: "14px 18px",
                fontSize: 16,
                background: "#fff",
                color: "#111",
                border: "1px solid #ddd",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              See How It Works
            </button>
          </a>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
          3 free estimates. No credit card required.
        </div>

        {/* Trust chips */}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 24,
          }}
        >
          {[
            "🛡️ PriceGuard™ checks",
            "🔗 Approval links",
            "✅ Print-ready PDFs",
            "🧾 Change orders",
            "📄 Invoices",
          ].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 13,
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #e9e9e9",
                background: "#fff",
                color: "#111",
                fontWeight: 750,
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </section>

      {/* PAIN SECTION */}
      <section style={sectionStyle}>
        <h2
          style={{
            margin: 0,
            fontSize: "clamp(30px, 5vw, 46px)",
            lineHeight: 1.05,
            letterSpacing: "-0.8px",
          }}
        >
          Contractors Lose Money on Missed Scope
        </h2>

        <p
          style={{
            color: "#555",
            fontSize: 17,
            lineHeight: 1.6,
            maxWidth: 740,
            marginTop: 12,
          }}
        >
          One forgotten detail can wipe out the profit on a job. JobEstimate Pro
          helps you slow down the estimate before the customer sees it, so you
          can catch the items that usually get missed.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginTop: 18,
          }}
        >
          {[
            "Doors, trim, ceilings, closets, and prep",
            "Demo, protection, haul-off, and cleanup",
            "Labor hours that were too low",
            "Materials, markup, tax, and deposits",
            "Change orders that were never approved",
            "Vague scopes that cause client pushback",
          ].map((item) => (
            <div key={item} style={cardStyle}>
              <div style={{ fontWeight: 850, lineHeight: 1.4 }}>✓ {item}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={sectionStyle}>
        <h2
          style={{
            marginBottom: 16,
            fontSize: "clamp(30px, 5vw, 44px)",
            letterSpacing: "-0.7px",
          }}
        >
          How It Works
        </h2>

        <div style={{ display: "grid", gap: 12 }}>
          {[
            {
              n: "1",
              title: "Enter the scope",
              text: "Describe the job, change order, or added work in plain language.",
            },
            {
              n: "2",
              title: "Review pricing",
              text: "Adjust labor, materials, subcontractors, markup, tax, deposit, and totals.",
            },
            {
              n: "3",
              title: "Check PriceGuard™",
              text: "Review possible missed scope, low pricing risks, quantity issues, and minimum charge problems.",
            },
            {
              n: "4",
              title: "Send for approval",
              text: "Download a professional PDF or send a customer approval link for signature.",
            },
            {
              n: "5",
              title: "Create invoice",
              text: "Turn approved work into an invoice without starting over.",
            },
          ].map((s) => (
            <div
              key={s.n}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                padding: 16,
                borderRadius: 16,
                border: "1px solid #eee",
                background: "#fafafa",
              }}
            >
              <div
                style={{
                  minWidth: 38,
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: "#111",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 950,
                }}
              >
                {s.n}
              </div>
              <div>
                <div style={{ fontWeight: 950, fontSize: 18 }}>{s.title}</div>
                <div style={{ color: "#555", marginTop: 4, lineHeight: 1.55 }}>
                  {s.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICEGUARD */}
      <section style={sectionStyle}>
        <div
          style={{
            padding: "28px 22px",
            borderRadius: 22,
            background: "#0b0b0b",
            color: "#fff",
            boxShadow: "0 18px 44px rgba(0,0,0,0.18)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "clamp(32px, 5vw, 48px)",
              lineHeight: 1.05,
              letterSpacing: "-0.9px",
            }}
          >
            Protect Your Profit With PriceGuard™
          </h2>

          <p
            style={{
              color: "#d7d7d7",
              lineHeight: 1.6,
              fontSize: 17,
              maxWidth: 760,
              marginTop: 12,
            }}
          >
            PriceGuard™ helps review your estimate for common underbidding
            risks before you send it to the customer.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              marginTop: 20,
            }}
          >
            {[
              "Missing scope items",
              "Low pricing risks",
              "Quantity issues",
              "Minimum charge problems",
              "Trade-specific labor assumptions",
              "State-based labor adjustments",
              "Pricing consistency checks",
              "Editable pricing controls",
            ].map((item) => (
              <div
                key={item}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  fontWeight: 800,
                }}
              >
                ✓ {item}
              </div>
            ))}
          </div>

          <p
            style={{
              color: "#bdbdbd",
              lineHeight: 1.55,
              fontSize: 13,
              marginTop: 18,
            }}
          >
            PriceGuard™ does not replace your judgment. It gives you a second
            set of eyes before you send the estimate.
          </p>
        </div>
      </section>

      {/* PREVIEW */}
      <section style={sectionStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "clamp(30px, 5vw, 44px)",
              letterSpacing: "-0.7px",
            }}
          >
            Professional Output
          </h2>
          <div style={{ fontSize: 13, color: "#666" }}>
            Clear scope. Pricing summary. Approval-ready.
          </div>
        </div>

        <p
          style={{
            color: "#555",
            lineHeight: 1.6,
            fontSize: 16,
            maxWidth: 720,
            marginTop: 10,
          }}
        >
          Generate a professional estimate your client can understand — with
          clear scope, pricing, approval language, and signature-ready output.
        </p>

        <div
          style={{
            marginTop: 16,
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid #e7e7e7",
            background: "#fff",
            boxShadow: "0 26px 60px rgba(0,0,0,0.12)",
          }}
        >
          <img
            src="/screenshot.png"
            alt="Example of a professional contractor estimate generated by JobEstimate Pro"
            style={{
              width: "100%",
              display: "block",
            }}
          />
        </div>
      </section>

      {/* APPROVALS + INVOICES */}
      <section style={sectionStyle}>
        <h2
          style={{
            marginBottom: 16,
            fontSize: "clamp(30px, 5vw, 44px)",
            letterSpacing: "-0.7px",
          }}
        >
          From Estimate to Approval to Invoice
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {[
            {
              title: "Get Work Approved Faster",
              text: "Send a customer-safe approval link, collect a signature, sync approval status, and keep the job moving.",
            },
            {
              title: "Create Change Orders",
              text: "Document added work clearly so you are not relying on memory, texts, or verbal agreements.",
            },
            {
              title: "Estimate to Invoice",
              text: "Create standard invoices, deposit invoices, balance invoices, and invoice PDFs without starting over.",
            },
          ].map((c) => (
            <div key={c.title} style={cardStyle}>
              <div style={{ fontWeight: 950, fontSize: 20 }}>{c.title}</div>
              <div
                style={{
                  marginTop: 8,
                  color: "#555",
                  lineHeight: 1.6,
                  fontSize: 15,
                }}
              >
                {c.text}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PLAN REVIEW */}
      <section style={sectionStyle}>
        <div
          style={{
            padding: 22,
            borderRadius: 20,
            border: "1px solid #eee",
            background: "#fafafa",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "clamp(28px, 5vw, 42px)",
              letterSpacing: "-0.7px",
            }}
          >
            Upload Plans for a Second Set of Eyes
          </h2>

          <p
            style={{
              color: "#555",
              lineHeight: 1.6,
              fontSize: 16,
              maxWidth: 760,
              marginTop: 10,
            }}
          >
            Upload plan pages so JobEstimate Pro can help review estimate
            evidence, summarize what was checked, and flag items that may need
            confirmation.
          </p>

          <p
            style={{
              color: "#777",
              lineHeight: 1.55,
              fontSize: 13,
              marginTop: 10,
            }}
          >
            Plan Review Assistant helps support your estimate. It does not
            replace field verification, measured takeoff, or your professional
            judgment.
          </p>
        </div>
      </section>

      {/* BUILT FOR */}
      <section style={sectionStyle}>
        <h2
          style={{
            marginBottom: 16,
            fontSize: "clamp(30px, 5vw, 44px)",
            letterSpacing: "-0.7px",
          }}
        >
          Built for Real Contractors
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 12,
          }}
        >
          {[
            "Handymen",
            "Remodelers",
            "Painters",
            "Drywall contractors",
            "Flooring installers",
            "Tile contractors",
            "Property maintenance crews",
            "Small construction businesses",
          ].map((trade) => (
            <div
              key={trade}
              style={{
                padding: 15,
                border: "1px solid #eee",
                borderRadius: 14,
                background: "#fff",
                fontWeight: 900,
              }}
            >
              {trade}
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section style={sectionStyle}>
        <h2
          style={{
            marginBottom: 8,
            fontSize: "clamp(30px, 5vw, 44px)",
            letterSpacing: "-0.7px",
            textAlign: "center",
          }}
        >
          Simple Pre-Launch Pricing
        </h2>

        <p
          style={{
            margin: "0 auto",
            color: "#555",
            textAlign: "center",
            maxWidth: 620,
            lineHeight: 1.6,
          }}
        >
          Try JobEstimate Pro free. Upgrade when you are ready to use it on real
          jobs.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
            marginTop: 22,
          }}
        >
          <div style={cardStyle}>
            <div style={{ fontWeight: 950, fontSize: 24 }}>Free</div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 950,
                letterSpacing: "-0.8px",
                marginTop: 8,
              }}
            >
              $0
            </div>
            <div style={{ color: "#555", marginTop: 6 }}>Test it out first.</div>

            <ul
              style={{
                paddingLeft: 20,
                marginTop: 16,
                color: "#333",
                lineHeight: 1.8,
              }}
            >
              <li>3 free estimates</li>
              <li>Basic estimate generation</li>
              <li>PDF download</li>
              <li>PriceGuard™ preview</li>
            </ul>

            <Link href="/app">
              <button
                style={{
                  ...buttonStyle,
                  width: "100%",
                  marginTop: 10,
                  boxShadow: "none",
                }}
              >
                Start Free
              </button>
            </Link>
          </div>

          <div
            style={{
              ...cardStyle,
              border: "2px solid #111",
              boxShadow: "0 18px 40px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 24 }}>Founder Access</div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 950,
                letterSpacing: "-0.8px",
                marginTop: 8,
              }}
            >
              $99
            </div>
            <div style={{ color: "#555", marginTop: 6 }}>
              One-time early access.
            </div>

            <ul
              style={{
                paddingLeft: 20,
                marginTop: 16,
                color: "#333",
                lineHeight: 1.8,
              }}
            >
              <li>Pro access during early launch</li>
              <li>Unlimited estimates</li>
              <li>Change orders</li>
              <li>Approval links</li>
              <li>Invoices</li>
              <li>Full PriceGuard™ checks</li>
              <li>Plan Review Assistant</li>
              <li>Future updates during early launch</li>
            </ul>

            <Link href="/app">
              <button
                style={{
                  ...buttonStyle,
                  width: "100%",
                  marginTop: 10,
                  boxShadow: "none",
                }}
              >
                Claim Founder Access
              </button>
            </Link>
          </div>
        </div>

        <p
          style={{
            color: "#777",
            fontSize: 13,
            textAlign: "center",
            lineHeight: 1.55,
            marginTop: 14,
          }}
        >
          Founder pricing is best if your current Stripe checkout is still
          one-time payment mode. Switch this section to Pro monthly after
          subscription billing is fully implemented.
        </p>
      </section>

      {/* BOTTOM CTA */}
      <section
        style={{
          marginTop: 56,
          paddingTop: 26,
          borderTop: "1px solid #eee",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            marginBottom: 8,
            fontSize: "clamp(32px, 5vw, 48px)",
            letterSpacing: "-0.9px",
            lineHeight: 1.05,
          }}
        >
          Stop Guessing. Start Estimating With Confidence.
        </h2>

        <p
          style={{
            margin: "0 auto",
            color: "#555",
            maxWidth: 680,
            lineHeight: 1.6,
            fontSize: 16,
          }}
        >
          Build the estimate, review the pricing, send it for approval, and
          create the invoice without fighting templates.
        </p>

        <Link href="/app">
          <button
            style={{
              ...buttonStyle,
              marginTop: 18,
            }}
          >
            Open JobEstimate Pro
          </button>
        </Link>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          marginTop: 60,
          paddingTop: 18,
          borderTop: "1px solid #eee",
        }}
      >
        <div style={{ fontSize: 12, color: "#777", textAlign: "center" }}>
          Professional estimates. Real-world jobs. Built to protect your profit.
        </div>
      </footer>
    </main>
  )
}