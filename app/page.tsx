"use client"

import { useEffect, useState } from "react"

const FREE_LIMIT = 3

export default function Home() {
  const [scopeChange, setScopeChange] = useState("")
  const [output, setOutput] = useState("")
  const [usageCount, setUsageCount] = useState(0)
  const [isPaid, setIsPaid] = useState(false)
  const [status, setStatus] = useState("")

  // Load usage + paid state
  useEffect(() => {
    setUsageCount(Number(localStorage.getItem("changeOrderCount") || "0"))

    if (localStorage.getItem("scopeguard_paid") === "true") {
      setIsPaid(true)
    }

    // Handle Stripe success redirect
    if (window.location.search.includes("paid=true")) {
      localStorage.setItem("scopeguard_paid", "true")
      setIsPaid(true)
      window.history.replaceState({}, "", "/")
    }
  }, [])

  async function generateChangeOrder() {
    if (!isPaid && usageCount >= FREE_LIMIT) {
      setStatus("Free limit reached. Please upgrade to continue.")
      return
    }

    setStatus("Generating change order...")

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeChange }),
    })

    if (!res.ok) {
      setStatus("Error generating change order.")
      return
    }

    const data = await res.json()
    setOutput(data.text)
    setStatus("")

    if (!isPaid) {
      const next = usageCount + 1
      localStorage.setItem("changeOrderCount", next.toString())
      setUsageCount(next)
    }
  }

  async function startCheckout() {
    setStatus("Starting checkout...")

    const res = await fetch("/api/checkout", { method: "POST" })

    if (!res.ok) {
      setStatus("Checkout API error")
      return
    }

    const data = await res.json()

    if (!data.url) {
      console.error("Checkout response:", data)
      setStatus("No checkout URL returned")
      return
    }

    window.location.href = data.url
  }

  const freeRemaining = Math.max(0, FREE_LIMIT - usageCount)
  const limitReached = !isPaid && usageCount >= FREE_LIMIT

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>ScopeGuard</h1>

      {!isPaid && (
        <p>
          Free uses remaining: <strong>{freeRemaining}</strong>
        </p>
      )}

      <textarea
  placeholder="Describe the scope change..."
  value={scopeChange}
  onChange={(e) => setScopeChange(e.target.value)}
  style={{
    width: "100%",
    height: 120,
    marginBottom: 12,
    padding: 10,
    border: "1px solid #ccc",
    borderRadius: 6,
  }}
/>

<button
  onClick={generateChangeOrder}
  disabled={limitReached}
  style={{
    padding: "10px 16px",
    marginBottom: 10,
    background: limitReached ? "#ccc" : "#000",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: limitReached ? "not-allowed" : "pointer",
  }}
>
  Generate Change Order
</button>

      {limitReached && (
        <>
          <p style={{ color: "red" }}>
            Free limit reached. Upgrade to continue.
          </p>

          <button
            onClick={startCheckout}
            style={{
              padding: "12px 20px",
              background: "#000",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            Upgrade for Unlimited Access
          </button>
        </>
      )}

      {status && (
        <p style={{ marginTop: 12 }}>{status}</p>
      )}

      {output && (
        <pre
          style={{
            marginTop: 20,
            padding: 12,
            background: "#f5f5f5",
            whiteSpace: "pre-wrap",
          }}
        >
          {output}
        </pre>
      )}
    </main>
  )
}