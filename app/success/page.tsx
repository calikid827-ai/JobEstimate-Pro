"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function SuccessPage() {
  const router = useRouter()

  useEffect(() => {
    async function syncAndReturn() {
      // Sync entitlement after successful Stripe checkout
      await fetch("/api/entitlement")
      // Redirect home and prevent back-button loop
      router.replace("/")
    }

    syncAndReturn()
  }, [router])

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
        Thank you for upgrading ScopeGuard.
        <br />
        You now have <strong>unlimited access</strong> to AI-generated
        change orders and estimates.
      </p>

      <Link
        href="/"
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
        Return to ScopeGuard
      </Link>

      <p
        style={{
          marginTop: 32,
          fontSize: 12,
          color: "#888",
        }}
      >
        You may safely close this page.
      </p>
    </main>
  )
}