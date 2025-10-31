// src/components/FlightPlanner.tsx
import { useState } from "react"
import type { UcusPlani } from "../types"
import { postFlightCoords } from "../api"
import { iataToLatLng, iataNearest } from "../lib/airports" // IST -> [lat, lng] | null

type Props = { onCreated?: (f: UcusPlani) => void; className?: string }

// datetime-local (TSİ) -> backend'e UTC ISO
function toUtcIso(local: string) {
  // local "YYYY-MM-DDTHH:mm" formatında gelmeli
  return new Date(local).toISOString()
}

export default function FlightPlanner({ onCreated, className }: Props) {
  // Form alanları
  const [code, setCode] = useState("")
  const [originIata, setOriginIata] = useState("")
  const [destIata, setDestIata] = useState("")
  const [startLocal, setStartLocal] = useState("") // <input type="datetime-local">
  const [endLocal, setEndLocal] = useState("")

  // Durum
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setOk(null)

    // Basit zorunlular
    const c = code.trim().toUpperCase()
    const o = originIata.trim().toUpperCase()
    const d = destIata.trim().toUpperCase()
    if (!c) return setError("Uçuş kodu zorunlu.")
    if (!o) return setError("Kalkış IATA zorunlu (örn. IST).")
    if (!d) return setError("Varış IATA zorunlu (örn. FRA).")
    if (!startLocal) return setError("Başlangıç zamanı zorunlu.")
    if (o === d) return setError("Kalkış ve varış aynı olamaz.")

    // IATA -> koordinat çevir
    const oPair = iataToLatLng(o)
    if (!oPair) return setError("Kalkış IATA geçersiz (ör. IST).")
    const dPair = iataToLatLng(d)
    if (!dPair) return setError("Varış IATA geçersiz (ör. FRA).")

    const [oLat, oLng] = oPair
    const [dLat, dLng] = dPair

    setSaving(true)
    try {
      const created = await postFlightCoords({
        code: c,
        startTimeUtc: toUtcIso(startLocal),
        endTimeUtc: endLocal ? toUtcIso(endLocal) : null,
        originLat: oLat,
        originLng: oLng,
        destinationLat: dLat,
        destinationLng: dLng,
      })
      onCreated?.(created)
      setOk(`${created.code} oluşturuldu (#${created.id}).`)

      // Formu temizle
      setCode("")
      setOriginIata("")
      setDestIata("")
      setStartLocal("")
      setEndLocal("")
    } catch (err: any) {
      const r = err?.response
      let msg = err?.message || "Kaydetme sırasında bir hata oluştu."
      if (r) {
        if (typeof r.data === "string" && r.data.trim()) msg = r.data
        else if (r.data?.mesaj) msg = r.data.mesaj
        else if (r.data?.message) msg = r.data.message
        else try { msg = JSON.stringify(r.data) } catch {}
        msg = `(${r.status}) ${msg}`
      }
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        {/* 1) Uçuş Kodu */}
        <div>
          <span className="fieldTitle">Uçuş Kodu</span>
          <input
            className="input"
            placeholder="THY203"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>

        {/* 2) Kalkış IATA */}
        <div>
          <span className="fieldTitle">Kalkış Havalimanı (IATA)</span>
          <input
            className="input"
            placeholder="IST"
            value={originIata}
            onChange={(e) => setOriginIata(e.target.value)}
            maxLength={4}
            required
          />
        </div>

        {/* 3) Varış IATA */}
        <div>
          <span className="fieldTitle">Varış Havalimanı (IATA)</span>
          <input
            className="input"
            placeholder="FRA"
            value={destIata}
            onChange={(e) => setDestIata(e.target.value)}
            maxLength={4}
            required
          />
        </div>

        {/* 4) Başlangıç (TSİ) */}
        <div>
          <span className="fieldTitle">Başlangıç (TSİ)</span>
          <input
            className="input"
            type="datetime-local"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
            required
          />
        </div>

        {/* 5) Bitiş (TSİ) */}
        <div>
          <span className="fieldTitle">Bitiş (TSİ) (opsiyonel)</span>
          <input
            className="input"
            type="datetime-local"
            value={endLocal}
            onChange={(e) => setEndLocal(e.target.value)}
          />
        </div>

        {/* Durum mesajları */}
        {error && <div style={{ color: "#d33" }}>{error}</div>}
        {ok && <div style={{ color: "#3c9" }}>{ok}</div>}

        {/* Gönder */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Kaydediliyor..." : "Uçuşu Oluştur"}
          </button>
        </div>
      </div>
    </form>
  )
}
