"use client"

import { useEffect, useState } from "react"
import jsPDF from "jspdf"

type CompanyProfile = {
  name: string
  address: string
  phone: string
  email: string
}

export default function Home() {
  const [scopeChange, setScopeChange] = useState("")
  const [result, setResult] = useState("")
  const [loading, setLoading] = useState(false)

  const [paid, setPaid] = useState(false)
  const [count, setCount] = useState(0)

  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>({
    name: "",
    address: "",
    phone: "",
    email: "",
  })

  const FREE_LIMIT = 3
  const remaining = Math.max(0, FREE_LIMIT - count)

  /* -------------------- LOAD STATE -------------------- */
  useEffect(() => {
    setCount(Number(localStorage.getItem("changeOrderCount") || "0"))
    setPaid(localStorage.getItem("scopeguard_paid") === "true")

    const savedProfile = localStorage.getItem("companyProfile")
    if (savedProfile) setCompanyProfile(JSON.parse(savedProfile))

    if (window.location.search.includes("paid=true")) {
      localStorage.setItem("scopeguard_paid", "true")
      setPaid(true)
      window.history.replaceState({}, "", "/")
    }
  }, [])

  /* -------------------- PERSIST COMPANY PROFILE -------------------- */
  useEffect(() => {
    localStorage.setItem("companyProfile", JSON.stringify(companyProfile))
  }, [companyProfile])

  /* -------------------- GENERATE CHANGE ORDER -------------------- */
  async function generate() {
    if (!paid && count >= FREE_LIMIT) return

    setLoading(true)
    setResult("")

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scopeChange,
        companyProfile,
      }),
    })

    if (!res.ok) {
      setLoading(false)
      setResult("Error generating change order.")
      return
    }

    const data = await res.json()
    setResult(data.text)

    if (!paid) {
      const newCount = count + 1
      localStorage.setItem("changeOrderCount", newCount.toString())
      setCount(newCount)
    }

    setLoading(false)
  }

  /* -------------------- STRIPE UPGRADE -------------------- */
  async function upgrade() {
    const res = await fetch("/api/checkout", { method: "POST" })
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }

  /* -------------------- PDF DOWNLOAD -------------------- */
  function downloadPDF() {
    const doc = new jsPDF()
    let y = 20

    doc.setFontSize(16)
    doc.text(companyProfile.name || "Company Name", 20, y)
    y += 8

    doc.setFontSize(10)
    if (companyProfile.address) doc.text(companyProfile.address, 20, y)
    y += 5
    if (companyProfile.phone) doc.text(companyProfile.phone, 20, y)
    y += 5
    if (companyProfile.email) doc.text(companyProfile.email, 20, y)
    y += 12

    doc.setFontSize(12)
    doc.text("CHANGE ORDER", 20, y)
    y += 10

    doc.setFontSize(10)
    const lines = doc.splitTextToSize(result, 170)
    doc.text(lines, 20, y)

    doc.save("change-order.pdf")
  }

  /* -------------------- UI -------------------- */
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "40px auto",
        padding: 32,
        background: "#fff",
        borderRadius: 14,
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        fontFamily: "system-ui",
      }}
    >
      <h1 style={{ fontSize: 34, marginBottom: 6 }}>ScopeGuard</h1>

      <p style={{ fontSize: 18, color: "#555", marginBottom: 24 }}>
        Instantly generate professional construction change orders.
      </p>

      {!paid && (
        <p style={{ marginBottom: 24 }}>
          Free uses remaining: <strong>{remaining}</strong>
        </p>
      )}

      {/* ---------- COMPANY PROFILE ---------- */}
      <h2 style={{ marginBottom: 12 }}>Company Profile</h2>

      {["name", "address", "phone", "email"].map((field) => (
        <input
          key={field}
          placeholder={
            field === "name"
              ? "Company Name"
              : field === "address"
              ? "Company Address"
              : field === "phone"
              ? "Phone Number"
              : "Email Address"
          }
          value={(companyProfile as any)[field]}
          onChange={(e) =>
            setCompanyProfile({
              ...companyProfile,
              [field]: e.target.value,
            })
          }
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 10,
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        />
      ))}

      {/* ---------- SCOPE INPUT ---------- */}
      <h2 style={{ marginTop: 28, marginBottom: 12 }}>
        Scope of Change
      </h2>

      <textarea
        placeholder="Example: Client requested adding recessed lighting in living room..."
        value={scopeChange}
        onChange={(e) => setScopeChange(e.target.value)}
        style={{
          width: "100%",
          height: 140,
          padding: 12,
          borderRadius: 8,
          border: "1px solid #ccc",
          marginBottom: 16,
        }}
      />

      <button
        onClick={generate}
        disabled={loading || (!paid && count >= FREE_LIMIT)}
        style={{
          width: "100%",
          padding: "12px 16px",
          background: "#000",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        {loading ? "Generating..." : "Generate Change Order"}
      </button>

      {!paid && count >= FREE_LIMIT && (
        <button
          onClick={upgrade}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "#444",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Upgrade for Unlimited Access
        </button>
      )}

      {/* ---------- OUTPUT ---------- */}
      {result && (
        <>
          <pre
            style={{
              marginTop: 24,
              padding: 16,
              background: "#f5f5f5",
              whiteSpace: "pre-wrap",
              borderRadius: 8,
            }}
          >
            {result}
          </pre>

          <button
            onClick={downloadPDF}
            style={{
              marginTop: 16,
              padding: "12px 16px",
              width: "100%",
              background: "#0066ff",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Download PDF
          </button>
        </>
      )}
    </main>
  )
}