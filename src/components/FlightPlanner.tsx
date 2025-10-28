import { useState, useEffect } from 'react'
import type { UcusPlani } from '../types'
import { postFlight, getFlights } from '../api'

type Props = { onCreated?: (f: UcusPlani) => void; className?: string }
// onCreated: Yeni uçuş eklendiğinde üst bileşene haber ver
// className: Dışarıdan özel CSS sınıfı eklemek için


const IATA = [
  "IST", "SAW", "ESB", "ADB", "AYT", "AMS", "BER", "FRA", "CDG", "LHR", "LGW", "FCO", "MXP", "ATH",
  "ZRH", "BCN", "MAD", "LIS", "BRU", "VIE", "PRG", "BUD", "WAW", "OSL", "CPH", "HEL", "DUB", "ARN",
  "JFK", "LAX", "ORD", "ATL", "DFW", "MIA", "YYZ", "YVR", "MEX", "DXB", "DOH", "RUH", "JED",
  "DEL", "BOM", "SIN", "KUL", "BKK", "HKG", "ICN", "NRT", "HND", "PEK", "PVG", "TPE", "SYD", "MEL", "AKL",
  "GRU", "EZE", "SCL", "LIM", "BOG", "CPT", "JNB", "ADD", "NBO", "CMN", "LOS"
];

/** datetime-local için (yerel TZ’de) YYYY-MM-DDTHH:mm üretir */
function localIsoMinute(d = new Date()) {
  const off = d.getTimezoneOffset();               // dk
  const fixed = new Date(d.getTime() - off * 60000);
  return fixed.toISOString().slice(0, 16);         // saniyesiz
}

/** Backend UTC veri istiyor o yüzden çeviriyo */
function toUtcIso(localStr: string) {
  return new Date(localStr).toISOString();
}

export default function FlightPlanner({ onCreated, className }: Props) {
  // Form değerleri
  const [code, setCode] = useState('THY203')
  const [origin, setOrigin] = useState('IST')         // Kalkış
  const [destination, setDestination] = useState('LHR') // Varış
  const [start, setStart] = useState(localIsoMinute()) // TSİ
  const [end, setEnd] = useState<string>('')

  // UI durumları
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // Öneriler çıkması için
  const [codeOpts, setCodeOpts] = useState<string[]>([])
  const [originOpts, setOriginOpts] = useState<string[]>([])
  const [destOpts, setDestOpts] = useState<string[]>([])

  // İlk yüklemede mevcut planlardan benzersiz code/origin/destination önerilerini çek
  useEffect(() => {
    (async () => {
      try {
        const list = await getFlights()
        const uniq = <T extends string>(arr: T[]) => Array.from(new Set(arr.filter(Boolean))).sort()
        setCodeOpts(uniq(list.map(f => f.code)))
        setOriginOpts(uniq(list.map(f => f.origin)))
        setDestOpts(uniq(list.map(f => f.destination)))
      } catch (e) {
        // Öneri gelmese de form çalışır; sessiz geç
        console.warn('Öneriler alınamadı:', e)
      }
    })()
  }, [])

  // Gönder
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null); setOk(null)

    // Basit validasyonlar
    if (origin.trim().toUpperCase() === destination.trim().toUpperCase()) {
      setBusy(false)
      setErr('Kalkış ve varış aynı olamaz.')
      return
    }

    try {
      const body = {
        code: code.trim().toUpperCase(),
        origin: origin.trim().toUpperCase(),
        destination: destination.trim().toUpperCase(),
        startTimeUtc: toUtcIso(start),
        endTimeUtc: end ? toUtcIso(end) : null,
      } as Omit<UcusPlani, 'id' | 'createdAtUtc' | 'ucakKonumlari'>

      const created = await postFlight(body)
      onCreated?.(created)
      setOk(`Planlandı (#${created.id})`)
    } catch (e: any) {
      setErr(e?.message ?? 'Kayıt başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`plannerCard ${className ?? ''}`}>
      <form onSubmit={submit} className="plannerGrid">
        {/* Code */}
        <div>
          <span className="fieldTitle">Kod</span>
          <div className="inputWrap">
            <div className="inputIcon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 7h16M4 12h10M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <select
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            >
              <option value="">Seç...</option>
              {[...new Set([
                ...codeOpts,
                "THY101", "THY203", "THY401", "TK7001",
                "PGT10", "PGT305", "XQ123", "XQ902",
                "FTH501", "SXS3305", "HV6203"
              ])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>


        {/* Kalkış (Origin) */}
        <div>
          <span className="fieldTitle">Kalkış</span>
          <div className="inputWrap">
            <div className="inputIcon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 22s7-8 7-12a7 7 0 10-14 0c0 4 7 12 7 12z" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <select
              className="input"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              required
            >
              <option value="">Seç...</option>
              {IATA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Varış (Destination) */}
        <div>
          <span className="fieldTitle">Varış</span>
          <div className="inputWrap">
            <div className="inputIcon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2v20M12 2l3 3M12 2L9 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <select
              className="input"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              required
            >
              <option value="">Seç...</option>
              {IATA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Start — TSİ */}
        <div>
          <span className="fieldTitle">Başlangıç</span>
          <div className="inputWrap">
            <div className="inputIcon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M7 3v3M17 3v3M4 8h16M5 11h4M11 11h4M5 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <input
              type="datetime-local"
              className="input"
              value={start}
              onChange={e => setStart(e.target.value)}
              required
            />
          </div>
        </div>

        {/* End — TSİ */}
        <div>
          <span className="fieldTitle">Bitiş</span>
          <div className="inputWrap">
            <div className="inputIcon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M7 3v3M17 3v3M4 8h16M8 14h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <input
              type="datetime-local"
              className="input"
              value={end}
              onChange={e => setEnd(e.target.value)}
            />
          </div>
        </div>

        {/* Planla butonu */}
        <div className="plannerSticky">
          <div className="plannerRow" style={{ justifyContent: 'flex-end' }}>
            {ok && <span className="statusText statusText--ok">{ok}</span>}
            {err && <span className="statusText statusText--err">{err}</span>}
            <button type="submit" disabled={busy} className="btn btn--primarySolid">
              {busy ? 'Kaydediliyor…' : 'Uçuşu Planla'}
            </button>
          </div>
        </div>
      </form>

      {/* === Datalist'ler === */}
      {/* Statik IATA (yedek) */}
      <datalist id="iataList">
        {IATA.map(code => <option key={code} value={code} />)}
      </datalist>

      {/* Code için: önce dinamik, sonra statik örnek kodlar */}
      <datalist id="codeList">
        {[...new Set([
          ...codeOpts,
          "THY101", "THY203", "THY401", "TK7001", "PGT10", "PGT305", "XQ123", "XQ902", "FTH501", "SXS3305", "HV6203"
        ])].map(c => <option key={c} value={c} />)}
      </datalist>

      {/* Origin/Destination için: dinamik + IATA birleşik */}
      <datalist id="originList">
        {[...new Set([...originOpts, ...IATA])].map(c => <option key={c} value={c} />)}
      </datalist>
      <datalist id="destList">
        {[...new Set([...destOpts, ...IATA])].map(c => <option key={c} value={c} />)}
      </datalist>
    </div>
  )
}