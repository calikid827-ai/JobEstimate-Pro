
"use client"

import Link from "next/link"

const workflow = [
  {
    number: "01",
    title: "Upload Plans",
    description:
      "Bring construction drawings, specifications, and project documents into one place.",
  },
  {
    number: "02",
    title: "Understand Scope",
    description:
      "Use AI-assisted plan review to identify relevant work, requirements, and unanswered questions.",
  },
  {
    number: "03",
    title: "Build Estimate",
    description:
      "Develop quantities and pricing using your company's approved estimating information.",
  },
  {
    number: "04",
    title: "Review Pricing",
    description:
      "Check costs, scope coverage, calculations, and potential underbidding risks.",
  },
  {
    number: "05",
    title: "Generate Proposal",
    description:
      "Prepare a clear, professional proposal based on your reviewed and approved estimate.",
  },
]

const benefits = [
  {
    number: "01",
    title: "Understand the Job",
    description:
      "Construction plans contain critical details. Keep drawing requirements, scope questions, and estimating decisions connected.",
  },
  {
    number: "02",
    title: "Estimate With Your Numbers",
    description:
      "Your labor rates, material costs, subcontractors, and profit targets should drive your estimate—not invented AI pricing.",
  },
  {
    number: "03",
    title: "Catch Potential Problems",
    description:
      "Identify possible missed scope, pricing concerns, unclear responsibilities, and quantities needing verification.",
  },
  {
    number: "04",
    title: "Create Better Proposals",
    description:
      "Turn your estimating work into organized, customer-friendly documents without starting from scratch.",
  },
]

const tools = [
  {
    title: "Estimates",
    description:
      "Develop job scopes, review pricing, and prepare professional estimating documents.",
  },
  {
    title: "PriceGuard™",
    description:
      "Get an additional review of potential scope gaps and pricing risks.",
  },
  {
    title: "Plan Review",
    description:
      "Examine uploaded project information and identify items that may need confirmation.",
  },
  {
    title: "Change Orders",
    description:
      "Document added work and organize changes to the original scope.",
  },
  {
    title: "Customer Approvals",
    description:
      "Keep pricing, approval documents, and customer decisions organized.",
  },
  {
    title: "Invoices",
    description:
      "Support the transition from estimated and approved work to billing.",
  },
]

const trades = [
  "General Contractors",
  "Remodelers",
  "Painting Contractors",
  "Drywall Contractors",
  "Wallcovering Installers",
  "Flooring Contractors",
  "Tile Contractors",
  "Handymen",
  "Property Maintenance",
  "Small Construction Businesses",
]

export default function HomePage() {
  return (
    <main className="jep">
      <style>{`
        .jep {
          --navy: #10243e;
          --blue: #2563eb;
          --text: #17263a;
          --muted: #64748b;
          --border: #e2e8f0;
          --light: #f8fafc;

          font-family: system-ui, -apple-system,
            BlinkMacSystemFont, "Segoe UI",
            Arial, sans-serif;
          background: #ffffff;
          color: var(--text);
          min-height: 100vh;
          line-height: 1.5;
        }

        .jep * {
          box-sizing: border-box;
        }

        .jep a {
          text-decoration: none;
        }

        .jep-container {
          width: min(1120px, calc(100% - 40px));
          margin: auto;
        }

        .jep-header {
          border-bottom: 1px solid var(--border);
          background: #ffffff;
        }

        .jep-nav {
          min-height: 82px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }

        .jep-logo {
          font-size: 25px;
          font-weight: 950;
          letter-spacing: -1.2px;
          color: var(--navy);
          line-height: 1.1;
        }

        .jep-logo span {
          color: var(--blue);
        }

        .jep-nav-actions {
          display: flex;
          gap: 20px;
          align-items: center;
        }

        .jep-nav-link {
          color: #475569;
          font-size: 14px;
          font-weight: 700;
        }

        .jep-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          min-height: 50px;
          padding: 13px 22px;
          border-radius: 11px;
          font-size: 15px;
          line-height: 1.3;
          font-weight: 850;
          transition: background .2s, transform .2s;
        }

        .jep-button:hover {
          transform: translateY(-2px);
        }

        .jep-primary {
          background: var(--blue);
          color: #ffffff;
        }

        .jep-primary:hover {
          background: #1d4ed8;
        }

        .jep-dark-button {
          background: var(--navy);
          color: #ffffff;
        }

        .jep-outline {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: var(--navy);
        }

        .jep-white-button {
          background: #ffffff;
          color: var(--navy);
        }

        .jep-hero {
          padding: 95px 0 90px;
          background:
            radial-gradient(
              ellipse at 90% 10%,
              rgba(37,99,235,.10),
              transparent 55%
            ),
            linear-gradient(180deg, #ffffff, #f7faff);
          border-bottom: 1px solid var(--border);
        }

        .jep-eyebrow {
          display: inline-block;
          padding: 8px 14px;
          color: #1d4ed8;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .7px;
          text-transform: uppercase;
        }

        .jep-hero h1 {
          max-width: 930px;
          margin: 26px 0 22px;
          color: var(--navy);
          font-size: clamp(44px, 7vw, 80px);
          font-weight: 950;
          line-height: 1.06;
          letter-spacing: -3px;
        }

        .jep-blue {
          color: var(--blue);
        }

        .jep-hero-description {
          max-width: 740px;
          font-size: clamp(17px, 2.3vw, 21px);
          color: #526174;
          line-height: 1.7;
        }

        .jep-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 30px;
        }

        .jep-hero-note {
          color: var(--muted);
          margin-top: 19px;
          font-size: 13px;
        }

        .jep-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 38px;
        }

        .jep-tag {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 100px;
          padding: 9px 14px;
          color: #334155;
          font-size: 13px;
          font-weight: 750;
        }

        .jep-section {
          padding: 85px 0;
        }

        .jep-soft {
          background: var(--light);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }

        .jep-label {
          color: var(--blue);
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          margin-bottom: 13px;
        }

        .jep-heading {
          max-width: 820px;
          margin: 0;
          color: var(--navy);
          font-size: clamp(32px, 5vw, 48px);
          line-height: 1.14;
          letter-spacing: -1.7px;
          font-weight: 950;
        }

        .jep-description {
          max-width: 750px;
          margin: 17px 0 0;
          color: var(--muted);
          font-size: 17px;
          line-height: 1.75;
        }

        .jep-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 25px;
          min-width: 0;
        }

        .jep-steps {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 13px;
          margin-top: 35px;
        }

        .jep-step {
          padding: 20px 17px;
        }

        .jep-number {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 43px;
          height: 43px;
          border-radius: 12px;
          background: #eff6ff;
          color: var(--blue);
          font-weight: 950;
        }

        .jep-card-title {
          margin: 19px 0 9px;
          font-size: 18px;
          color: var(--navy);
          line-height: 1.3;
          font-weight: 900;
        }

        .jep-card-description {
          margin: 0;
          font-size: 14px;
          line-height: 1.7;
          color: var(--muted);
        }

        .jep-note {
          margin-top: 24px;
          padding: 17px 20px;
          border-radius: 12px;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          color: #334155;
          font-size: 14px;
          line-height: 1.7;
        }

        .jep-feature-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-top: 35px;
        }

        .jep-feature-card {
          padding: 30px;
        }

        .jep-feature-card h3 {
          margin: 12px 0 10px;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -.5px;
          color: var(--navy);
        }

        .jep-feature-card p {
          margin: 0;
          color: var(--muted);
          font-size: 15px;
          line-height: 1.75;
        }

        .jep-feature-number {
          color: var(--blue);
          font-size: 13px;
          font-weight: 950;
        }

        .jep-dark-panel {
          background: var(--navy);
          border-radius: 25px;
          padding: 48px;
          color: #ffffff;
        }

        .jep-dark-panel h2 {
          margin: 0;
          font-size: clamp(32px, 5vw, 48px);
          line-height: 1.12;
          letter-spacing: -1.5px;
          font-weight: 950;
        }

        .jep-dark-panel p {
          max-width: 720px;
          margin: 18px 0 0;
          color: #d3deeb;
          font-size: 17px;
          line-height: 1.75;
        }

        .jep-checks {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 13px;
          margin-top: 27px;
        }

        .jep-check {
          padding: 15px 17px;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 12px;
          background: rgba(255,255,255,.06);
          font-size: 14px;
          font-weight: 750;
        }

        .jep-tool-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-top: 35px;
        }

        .jep-tool-grid .jep-card-title {
          margin-top: 0;
        }

        .jep-trades {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 30px;
        }

        .jep-trade {
          padding: 13px 17px;
          border: 1px solid var(--border);
          border-radius: 11px;
          background: #ffffff;
          font-size: 14px;
          font-weight: 800;
          color: #334155;
        }

        .jep-cta {
          text-align: center;
          background:
            linear-gradient(135deg, #10243e, #1c4270);
          color: #ffffff;
          padding: 82px 25px;
          border-radius: 25px;
        }

        .jep-cta h2 {
          max-width: 800px;
          margin: auto;
          font-size: clamp(34px, 5vw, 55px);
          font-weight: 950;
          letter-spacing: -1.7px;
          line-height: 1.12;
        }

        .jep-cta p {
          max-width: 680px;
          margin: 20px auto 0;
          color: #d8e3f0;
          line-height: 1.75;
          font-size: 17px;
        }

        .jep-cta-actions {
          display: flex;
          justify-content: center;
          margin-top: 30px;
        }

        .jep-footer {
          padding: 30px 0;
          margin-top: 35px;
          border-top: 1px solid var(--border);
        }

        .jep-footer-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
        }

        .jep-footer-text {
          color: var(--muted);
          font-size: 12px;
        }

        @media (max-width: 950px) {
          .jep-steps {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .jep-tool-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .jep-container {
            width: calc(100% - 32px);
          }

          .jep-nav {
            min-height: 72px;
          }

          .jep-logo {
            font-size: 21px;
          }

          .jep-nav-link {
            display: none;
          }

          .jep-nav .jep-button {
            padding: 10px 13px;
            min-height: 42px;
            font-size: 13px;
          }

          .jep-hero {
            padding: 65px 0;
          }

          .jep-hero h1 {
            font-size: clamp(39px, 10vw, 54px);
            letter-spacing: -1.8px;
          }

          .jep-section {
            padding: 65px 0;
          }

          .jep-steps,
          .jep-feature-grid,
          .jep-tool-grid,
          .jep-checks {
            grid-template-columns: 1fr;
          }

          .jep-step {
            padding: 22px;
          }

          .jep-dark-panel {
            padding: 30px 23px;
            border-radius: 19px;
          }

          .jep-cta {
            padding: 58px 22px;
          }

          .jep-actions .jep-button {
            width: 100%;
          }

          .jep-footer-content {
            justify-content: center;
            text-align: center;
          }
        }
      `}</style>

      {/* HEADER */}
      <header className="jep-header">
        <div className="jep-container jep-nav">
          <Link href="/" className="jep-logo">
            JobEstimate <span>Pro</span>
          </Link>

          <div className="jep-nav-actions">
            <a href="#how-it-works" className="jep-nav-link">
              How It Works
            </a>

            <Link href="/app" className="jep-button jep-dark-button">
              Open App
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="jep-hero">
        <div className="jep-container">
          <div className="jep-eyebrow">
            AI-Assisted Construction Estimating
          </div>

          <h1>
            From Construction Plans to{" "}
            <span className="jep-blue">
              Professional Estimates.
            </span>
          </h1>

          <p className="jep-hero-description">
            Meet the construction estimating platform we&apos;re building
            for real contractors. Bring your plans and project scope
            together, review important requirements, develop pricing,
            and create professional proposals with greater confidence.
          </p>

          <div className="jep-actions">
            <Link href="/app" className="jep-button jep-primary">
              Open JobEstimate Pro
            </Link>

            <a
              href="#how-it-works"
              className="jep-button jep-outline"
            >
              See How It Works
            </a>
          </div>

          <div className="jep-hero-note">
            Start with the existing estimating tools.
            Advanced plan-to-proposal features are in development.
          </div>

          <div className="jep-tags">
            <div className="jep-tag">Plan Intelligence</div>
            <div className="jep-tag">Smart Estimating</div>
            <div className="jep-tag">PriceGuard™</div>
            <div className="jep-tag">Professional Proposals</div>
            <div className="jep-tag">Change Orders</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how-it-works"
        className="jep-section jep-soft"
      >
        <div className="jep-container">
          <div className="jep-label">
            The JobEstimate Pro Vision
          </div>

          <h2 className="jep-heading">
            One Complete Estimating Workflow.
          </h2>

          <p className="jep-description">
            We&apos;re building JobEstimate Pro around how contractors
            actually estimate work—from understanding project
            documents to preparing a proposal ready for review.
          </p>

          <div className="jep-steps">
            {workflow.map((step) => (
              <div className="jep-card jep-step" key={step.number}>
                <div className="jep-number">
                  {step.number}
                </div>

                <h3 className="jep-card-title">
                  {step.title}
                </h3>

                <p className="jep-card-description">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          <div className="jep-note">
            <strong>In development:</strong> The connected
            plan-to-proposal workflow shown above is our product
            direction. Available features and capabilities may
            differ while development and validation continue.
          </div>
        </div>
      </section>

      {/* WHY JOBESTIMATE PRO */}
      <section className="jep-section">
        <div className="jep-container">
          <div className="jep-label">
            Built Around Real Construction Work
          </div>

          <h2 className="jep-heading">
            Better Estimates Start With
            Understanding the Job.
          </h2>

          <p className="jep-description">
            A professional-looking proposal means nothing if
            important work was overlooked or the pricing doesn&apos;t
            cover the job. Our focus is helping contractors make
            informed estimating decisions before sending a bid.
          </p>

          <div className="jep-feature-grid">
            {benefits.map((benefit) => (
              <div
                className="jep-card jep-feature-card"
                key={benefit.number}
              >
                <div className="jep-feature-number">
                  {benefit.number}
                </div>

                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLAN INTELLIGENCE */}
      <section className="jep-section jep-soft">
        <div className="jep-container">
          <div className="jep-label">
            Plan Intelligence
          </div>

          <h2 className="jep-heading">
            Understand the Plans Before
            You Price the Work.
          </h2>

          <p className="jep-description">
            Plan Study is being developed to help contractors
            review construction documents, connect findings to
            source information, and identify questions that
            could affect project scope.
          </p>

          <div className="jep-feature-grid">
            {[
              {
                title: "Drawing Requirements",
                text: "Review relevant notes, finish information, and project instructions.",
              },
              {
                title: "Source References",
                text: "Keep important findings connected to the documents supporting them.",
              },
              {
                title: "Scope Questions",
                text: "Identify unclear responsibilities, conflicts, and missing information.",
              },
              {
                title: "Document Revisions",
                text: "Work toward tracking changes without losing the original project decisions.",
              },
            ].map((item) => (
              <div className="jep-card" key={item.title}>
                <h3 className="jep-card-title">
                  {item.title}
                </h3>

                <p className="jep-card-description">
                  {item.text}
                </p>
              </div>
            ))}
          </div>

          <div className="jep-note">
            Plan analysis assists professional review. It does
            not guarantee complete scope detection or replace
            field verification, measured takeoffs, or
            contractor judgment.
          </div>
        </div>
      </section>

      {/* PRICEGUARD */}
      <section className="jep-section">
        <div className="jep-container">
          <div className="jep-dark-panel">
            <div
              className="jep-label"
              style={{ color: "#93c5fd" }}
            >
              PriceGuard™
            </div>

            <h2>
              Stop Guessing.
              <br />
              Start Protecting Your Profit.
            </h2>

            <p>
              PriceGuard™ is designed to give contractors
              another opportunity to review their estimates
              before sending them to customers.
            </p>

            <div className="jep-checks">
              {[
                "Potential missed scope",
                "Low pricing concerns",
                "Quantity issues",
                "Labor assumptions",
                "Material and subcontractor costs",
                "Pricing consistency",
                "Markup and profit considerations",
                "Unresolved estimating questions",
              ].map((item) => (
                <div className="jep-check" key={item}>
                  ✓ {item}
                </div>
              ))}
            </div>

            <p style={{ fontSize: 13 }}>
              PriceGuard™ is a review aid, not a guarantee
              of profitability, complete scope coverage,
              or accurate pricing.
            </p>
          </div>
        </div>
      </section>

      {/* EXISTING TOOL AREAS */}
      <section className="jep-section jep-soft">
        <div className="jep-container">
          <div className="jep-label">
            More Than an Estimate
          </div>

          <h2 className="jep-heading">
            Tools for the Work Behind
            Every Construction Job.
          </h2>

          <p className="jep-description">
            JobEstimate Pro brings estimating and project
            documentation tools together while we continue
            developing the connected AI workflow.
          </p>

          <div className="jep-tool-grid">
            {tools.map((tool) => (
              <div className="jep-card" key={tool.title}>
                <h3 className="jep-card-title">
                  {tool.title}
                </h3>

                <p className="jep-card-description">
                  {tool.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BUILT FOR */}
      <section className="jep-section">
        <div className="jep-container">
          <div className="jep-label">
            Who It&apos;s For
          </div>

          <h2 className="jep-heading">
            Built for Real Contractors.
          </h2>

          <p className="jep-description">
            Whether you&apos;re pricing a small repair or
            reviewing a large renovation, the goal is
            to give contractors a practical estimating
            assistant that works with their trade,
            pricing, and project requirements.
          </p>

          <div className="jep-trades">
            {trades.map((trade) => (
              <div className="jep-trade" key={trade}>
                {trade}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="jep-section">
        <div className="jep-container">
          <div className="jep-cta">
            <h2>
              Understand the Scope.
              <br />
              Price the Work.
              <br />
              Win With Confidence.
            </h2>

            <p>
              Better construction estimating starts
              with better information. Explore JobEstimate Pro
              as we build toward a complete
              AI-assisted estimating experience.
            </p>

            <div className="jep-cta-actions">
              <Link
                href="/app"
                className="jep-button jep-white-button"
              >
                Open JobEstimate Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="jep-footer">
        <div className="jep-container jep-footer-content">
          <div className="jep-logo" style={{ fontSize: 19 }}>
            JobEstimate <span>Pro</span>
          </div>

          <div className="jep-footer-text">
            Built for real contractors.
            Designed for smarter estimating.
          </div>
        </div>
      </footer>
    </main>
  )
}
