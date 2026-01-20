"use client"

import { useEffect } from "react"

export default function SuccessPage() {
  useEffect(() => {
    localStorage.setItem("scopeguard_paid", "true")

    setTimeout(() => {
      window.location.href = "/"
    }, 1500)
  }, [])

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Payment Successful ✅</h1>
      <p>Unlocking premium features…</p>
    </div>
  )
}