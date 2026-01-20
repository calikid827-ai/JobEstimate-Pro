"use client"

import { useEffect, useState } from "react"
import { jsPDF } from "jspdf"

const FREE_LIMIT = 3

type LineItem = {
  description: string
  cost: number
}

export default function Home() {
  const [companyName, setCompanyName] = useState("")
  const [clientName, setClientName] = useState("")
  const [jobAddress, setJobAddress] = useState("")
  const [scopeChange, setScopeChange] = useState("")
  const [output, setOutput] = useState("")
  const [usageCount, setUsageCount] = useState(0)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)

  const [items, setItems] = useState<LineItem[]>([{ description: "", cost: 0 }])
  const [markupPercent, setMarkupPercent] = useState(20)

  // 🔒 Payment
  const [isPaid, setIsPaid] = useState(false)
  const [paymentTerms, setPaymentTerms] = useState("Net 15")
  const [dueDate, setDueDate] = useState("")
  const [paymentNotes, setPaymentNotes] = useState("")

  // Load usage + payment state
  useEffect(() => {
    setUsageCount(Number(localStorage.getItem("changeOrderCount") || "0"))

    if (localStorage.getItem("scopeguard_paid") === "true") {
      setIsPaid(true)
    }

    // Stripe redirect handler
    if (window.location.search.includes("paid=true")) {
      localStorage.setItem("scopeguard_paid", "true")
      setIsPaid(true)
      window.history.replaceState({}, "", "/")
    }
  }, [])

  const subtotal = items.reduce((sum, i) => sum + (i.cost || 0), 0)
  const markupAmount = subtotal * (markupPercent / 100)
  const total = subtotal + markupAmount

  async function generateChangeOrder() {
    if (!isPaid && usageCount >= FREE_LIMIT) {
      setOutput("Free limit reached. Please upgrade to continue.")
      return
    }

    setOutput("Generating change order...")

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scopeChange,
        subtotal,
        markup: markupPercent,
        total,
        paymentTerms,
        dueDate,
      }),
    })

    const data = await res.json()
    setOutput(data.text)

    if (!isPaid) {
      const newCount = usageCount + 1
      localStorage.setItem("changeOrderCount", newCount.toString())
      setUsageCount(newCount)
    }
  }

  async function startCheckout() {
    const res = await fetch("/api/checkout", { method: "POST" })
    const data = await res.json()
    window.location.href = data.url
  }

  function downloadPDF() {
    if (!isPaid) {
      alert("Upgrade required to download PDFs.")
      return
    }

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 20

    if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", 20, y, 40, 20)

    doc.setFontSize(14)
    doc.text(companyName || "Company Name", logoDataUrl ? 70 : 20, y + 10)
    y += 30

    doc.setFontSize(20)
    doc.text("CHANGE ORDER", pageWidth / 2, y, { align: "center" })
    y += 10
    doc.line(20, y, pageWidth - 20, y)
    y += 10

    doc.setFontSize(11)
    doc.text(`Client: ${clientName}`, 20, y)
    y += 6
    doc.text(`Job Address: ${jobAddress}`, 20, y)
    y += 6
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, y)
    y += 12

    doc.setFontSize(13)
    doc.text("Scope of Change", 20, y)
    y += 6
    doc.line(20, y, pageWidth - 20, y)
    y += 8

    doc.setFontSize(11)
    doc.text(doc.splitTextToSize(output, pageWidth - 40), 20, y)
    y += 40

    doc.setFontSize(13)
    doc.text("Cost Breakdown", 20, y)
    y += 8

    items.forEach((i) => {
      if (!i.description) return
      doc.text(i.description, 20, y)
      doc.text(`$${i.cost.toFixed(2)}`, pageWidth - 20, y, { align: "right" })
      y += 6
    })

    y += 8
    doc.text(`Total Due: $${total.toFixed(2)}`, pageWidth - 20, y, { align: "right" })
    y += 12

    doc.setFontSize(13)
    doc.text("Payment Terms", 20, y)
    y += 6
    doc.text(`Terms: ${paymentTerms}`, 20, y)
    if (dueDate) {
      y += 6
      doc.text(`Due Date: ${dueDate}`, 20, y)
    }

    doc.save("change-order.pdf")
  }

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "Arial, sans-serif" }}>
      <h1>ScopeGuard – Create Change Order</h1>

      {!isPaid && (
        <p style={{ color: "red" }}>
          Free uses remaining: {Math.max(0, FREE_LIMIT - usageCount)}
        </p>
      )}

      <input placeholder="Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
      <input placeholder="Client Name" value={clientName} onChange={(e) => setClientName(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
      <input placeholder="Job Address" value={jobAddress} onChange={(e) => setJobAddress(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

      <textarea placeholder="Describe scope change..." value={scopeChange} onChange={(e) => setScopeChange(e.target.value)} style={{ width: "100%", height: 90 }} />

      <h3>Cost Breakdown</h3>

      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input placeholder="Description" value={item.description} onChange={(e) => {
            const copy = [...items]; copy[i].description = e.target.value; setItems(copy)
          }} style={{ flex: 1 }} />
          <input type="number" value={item.cost} onChange={(e) => {
            const copy = [...items]; copy[i].cost = Number(e.target.value); setItems(copy)
          }} style={{ width: 100 }} />
        </div>
      ))}

      <button onClick={() => setItems([...items, { description: "", cost: 0 }])}>+ Add Line Item</button>

      <p><strong>Total: ${total.toFixed(2)}</strong></p>

      {isPaid && (
        <>
          <h3>Payment Terms</h3>
          <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
            <option>Due on Receipt</option>
            <option>Net 7</option>
            <option>Net 15</option>
            <option>Net 30</option>
          </select>

          <br /><br />

          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <br /><br />

          <textarea placeholder="Payment notes (optional)" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} style={{ width: "100%", height: 60 }} />
        </>
      )}

      <button onClick={generateChangeOrder}>Generate Change Order</button>
      <br /><br />
      <button onClick={downloadPDF}>Download PDF</button>

      {!isPaid && (
        <>
          <br /><br />
          <button onClick={startCheckout} style={{ background: "#000", color: "#fff", padding: "10px 16px" }}>
            Upgrade to Unlock PDFs & Payment Terms
          </button>
        </>
      )}
    </div>
  )
}