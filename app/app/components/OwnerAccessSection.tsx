"use client"

import { useState } from "react"
import type { OwnerSessionHandle } from "../lib/owner-session"

export default function OwnerAccessSection({ session }: { session: OwnerSessionHandle }) {
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const busy = ["checking", "sending", "verifying"].includes(session.phase)
  const awaitingCode = session.phase === "code_sent" || session.phase === "verifying"
  const inputStyle = { width: "100%", minWidth: 0, padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 16 } as const
  const buttonStyle = { padding: "10px 14px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", cursor: "pointer", fontWeight: 650, minHeight: 44 } as const

  return <section aria-label="Account sign-in" style={{ display: "grid", gap: 12, minWidth: 0 }}>
    {session.owner ? <>
      <p style={{ margin: 0 }}>Signed in as <strong style={{ overflowWrap: "anywhere" }}>{session.owner.email}</strong>.</p>
      <button type="button" style={{ ...buttonStyle, justifySelf: "start" }} onClick={() => { void session.signOut() }}>Sign out</button>
    </> : <>
      <p style={{ margin: 0, color: "#475569", lineHeight: 1.5 }}>Sign in to access your estimates, share proposals, and manage your account.</p>
      {awaitingCode ? <form onSubmit={event => { event.preventDefault(); void session.verify(code) }} style={{ display: "grid", gap: 10 }}>
        <p style={{ margin: 0, overflowWrap: "anywhere" }}>Enter the code sent to <strong>{session.pendingEmail}</strong>.</p>
        <label style={{ display: "grid", gap: 6 }}>Email verification code
          <input aria-label="Email verification code" value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" required disabled={busy} style={inputStyle} />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="submit" disabled={busy || !code.trim()} style={buttonStyle}>{session.phase === "verifying" ? "Verifying..." : "Verify and sign in"}</button>
          <button type="button" disabled={busy} style={buttonStyle} onClick={() => { setCode(""); session.cancel() }}>Use a different email</button>
        </div>
      </form> : <form onSubmit={event => { event.preventDefault(); setCode(""); void session.signIn(email) }} style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>Account email
          <input aria-label="Account email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" required disabled={busy} style={inputStyle} />
        </label>
        <button type="submit" disabled={busy} style={{ ...buttonStyle, justifySelf: "start" }}>{session.phase === "sending" ? "Sending code..." : session.phase === "checking" ? "Checking sign-in..." : "Send sign-in code"}</button>
      </form>}
    </>}
    {session.error && <p role="alert" style={{ margin: 0, color: "#b91c1c", lineHeight: 1.5 }}>{session.error}</p>}
  </section>
}
