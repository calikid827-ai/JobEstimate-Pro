"use client"

import { useEffect, useState } from "react"
import { jsPDF } from "jspdf"

const FREE_LIMIT = 3

export default function Home() {
  const [companyName, setCompanyName] = useState("")
  const [clientName, setClientName] = useState("")
  const [jobAddress, setJobAddress] = useState("")
  const [scopeChange, setScopeChange] = useState("")
  const [description, setDescription] = useState("")
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)

  const [subtotal, setSubtotal] = useState<number>(0)
  const [markupPercent, setMarkupPercent] = useState<number>(20)
  const [total, setTotal] = useState<number>(0)

  const [usageCount, setUsageCount] = useState(0)
  const [isPaid, setIsPaid] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setUsageCount(Number(localStorage.getItem("changeOrderCount") || "0"))
    if (localStorage.getItem("scopeguard_paid") === "true") setIsPaid(true)
  }, [])

  useEffect(() => {
    const calculated = subtotal + subtotal * (markupPercent / 100)
    setTotal(Number(calculated.toFixed(2)))
  }, [subtotal, markupPercent])

  async function generateChangeOrder() {
    if (!isPaid && usageCount >= FREE_LIMIT) return

    setLoading(true)
    setDescription("")

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scopeChange,
      }),
    })

    const data = await res.json()

    setDescription(data.text)
    setSubtotal(data.subtotal || 0)
    setMarkupPercent(data.markup || 20)

    if (!isPaid) {
      const newCount = usageCount + 1
      localStorage.setItem("changeOrderCount", newCount.toString())
      setUsageCount(newCount)
    }

    setLoading(false)
  }

  async function startCheckout() {
    const res = await fetch("/api/checkout", { method: "POST" })
    const data = await res.json()
    window.location.href = data.url
  }

  function downloadPDF() {
    if (!isPaid) return alert("Upgrade required to download PDFs")

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 20

    // Letterhead
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 20, y, 40, 20)
      doc.setFontSize(14)
      doc.text(companyName || "Company Name", 70, y + 12)
      y += 30
    } else {
      doc.setFontSize(16)
      doc.text(companyName || "Company Name", pageWidth / 2, y, { align: "center" })
      y += 20
    }

    // Title
    doc.setFontSize(20)
    doc.text("CHANGE ORDER", pageWidth / 2, y, { align: "center" })
    y += 10
    doc.line(20, y, pageWidth - 20, y)
    y += 10

    // Info
    doc.setFontSize(11)
    doc.text(`Client: ${clientName}`, 20, y)
    y += 6
    doc.text(`Job Address: ${jobAddress}`, 20, y)
    y += 6
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, y)
    y += 12

    // Description
    doc.setFontSize(13)
    doc.text("Scope of Change", 20, y)
    y += 6
    doc.line(20, y, pageWidth - 20, y)
    y += 8

    doc.setFontSize(11)
    doc.text(doc.splitTextToSize(description, pageWidth - 40), 20, y)
    y += 30

    // Pricing
    doc.setFontSize(13)
    doc.text("Pricing Summary", 20, y)
    y += 8

    doc.setFontSize(11)
    doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 20, y)
    y += 6
    doc.text(`Markup (${markupPercent}%): $${(total - subtotal).toFixed(2)}`, 20, y)
    y += 6
    doc.setFontSize(12)
    doc.text(`Total Due: $${total.toFixed(2)}`, 20, y)

    doc.save("change-order.pdf")
  }

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>ScopeGuard</h1>

      {!isPaid && (
        <p style={{ color: "red" }}>
          Free uses remaining: {Math.max(0, FREE_LIMIT - usageCount)}
        </p>
      )}

      <input placeholder="Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
      <input placeholder="Client Name" value={clientName} onChange={(e) => setClientName(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
      <input placeholder="Job Address" value={jobAddress} onChange={(e) => setJobAddress(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

      <label>
        Company Logo
        <input type="file" accept="image/png, image/jpeg" onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const reader = new FileReader()
          reader.onload = () => setLogoDataUrl(reader.result as string)
          reader.readAsDataURL(file)
        }} />
      </label>

      <textarea
        placeholder="Describe the scope change..."
        value={scopeChange}
        onChange={(e) => setScopeChange(e.target.value)}
        style={{ width: "100%", height: 100, marginTop: 10 }}
      />

      <button onClick={generateChangeOrder} disabled={loading} style={{ marginTop: 10 }}>
        {loading ? "Generating..." : "Generate Change Order"}
      </button>

      {description && (
        <>
          <h3 style={{ marginTop: 20 }}>Editable Change Order</h3>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: "100%", minHeight: 180, background: "#f5f5f5", padding: 12 }}
          />

          <h3>Pricing</h3>

          <input type="number" value={subtotal} onChange={(e) => setSubtotal(Number(e.target.value))} />
          <input type="number" value={markupPercent} onChange={(e) => setMarkupPercent(Number(e.target.value))} />

          <p><strong>Total: ${total.toFixed(2)}</strong></p>

          <button onClick={downloadPDF}>Download PDF</button>
        </>
      )}

      {!isPaid && usageCount >= FREE_LIMIT && (
        <button onClick={startCheckout} style={{ marginTop: 20 }}>
          Upgrade to Unlock PDFs
        </button>
      )}
    </div>
  )
}