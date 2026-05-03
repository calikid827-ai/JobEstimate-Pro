"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

const EMAIL_KEY = "jobestimatepro_email"

export default function SuccessPage() {
  const [status, setStatus] = useState<"loading" | "success" | "missing-email" | "error">("loading")
  const [message, setMessage] = useState("Confirming your Pro access...")

  useEffect(() => {
    let cancelled = false

    async function syncEntitlement() {
      const email = window.localStorage.getItem(EMAIL_KEY)?.trim().toLowerCase() || ""

      if (!email) {
        if (cancelled) return
        setStatus("missing-email")
        setMessage("Return to the app and enter the email address used at checkout so we can confirm your Pro access.")
        return
      }

      try {
        const response = await fetch("/api/entitlement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })

        if (!response.ok) {
          throw new Error("Entitlement check failed.")
        }

        const data = await response.json().catch(() => null)
        if (cancelled) return

        if (data?.entitled === true) {
          setStatus("success")
          setMessage("Your Pro access is active. Return to the app to continue.")
        } else {
          setStatus("error")
          setMessage("Payment succeeded, but Pro access is not active yet. Return to the app and retry with the email used at checkout.")
        }
      } catch {
        if (cancelled) return
        setStatus("error")
        setMessage("Payment succeeded, but we could not confirm Pro access yet. Return to the app and retry with the email used at checkout.")
      }
    }

    syncEntitlement()

    return () => {
      cancelled = true
    }
  }, [])

  const statusColor =
    status === "success"
      ? "#065f46"
      : status === "loading"
        ? "#555"
        : "#92400e"

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "100px auto",
        padding: 32,
        textAlign: "center",
        fontFamily: "system-ui",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        background: "#ffffff",
        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>
        Payment Successful
      </h1>

      <p style={{ fontSize: 16, color: "#555", lineHeight: 1.6 }}>
        Thank you for upgrading JobEstimate Pro.
        <br />
        {status === "success"
          ? "You now have Pro access with generous fair-use generation for normal contractor estimating workflows."
          : "We are checking your Pro access."}
      </p>

      <div
        role="status"
        aria-live="polite"
        style={{
          marginTop: 18,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: status === "success" ? "#ecfdf5" : status === "loading" ? "#f9fafb" : "#fffbeb",
          color: statusColor,
          fontSize: 14,
          lineHeight: 1.5,
          fontWeight: 650,
        }}
      >
        {message}
      </div>

      <Link
        href="/app"
        style={{
          display: "inline-block",
          marginTop: 24,
          padding: "12px 20px",
          background: "#000",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Return to JobEstimate Pro
      </Link>

      <p
        style={{
          marginTop: 32,
          fontSize: 12,
          color: "#888",
        }}
      >
        {status === "loading" ? "This usually takes a few seconds." : "You may safely close this page after returning to the app."}
      </p>
    </main>
  )
}
