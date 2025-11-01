// src/pages/Dashboard.tsx
import { useEffect, useRef, useMemo, useState } from 'react'
import Map from '../components/Map'
import type { UcusPlani, UcakKonum } from '../types'
import { getFlights, getLastPosition, getRangePositions, postPosition } from '../api'
import FlightPlanner from '../components/FlightPlanner'
import TopBar from "../components/TopBar"
import "../styles/topbar.css"
import type { Continent } from '../lib/continents'
import { flightContinentFrom } from '../lib/continents'
import FlightInfoCard from "../components/FlightInfoCard"
import { iataToLatLng } from '../lib/airports'
import FlightListPanel from "../components/FlightListPanel";
import { getFlightsByDateRange } from "../api"


/* =========================
   TSİ sadece GÖRÜNÜM için (input/etiket)
   ========================= */
function toLocalInputValue(d: Date) {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
function fmtTSI(d: Date | number | string) {
  const dt = typeof d === 'number' ? new Date(d) : new Date(d)
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(dt)
}

/* =========================
   İnterpolasyon (replay)
   ========================= */
function interpAt(arr: UcakKonum[] | undefined, refIso: string): UcakKonum | null {
  const a = (arr ?? []).slice()
  if (!a.length) return null
  a.sort((x, y) => +new Date(x.timestampUtc) - +new Date(y.timestampUtc))

  const ref = +new Date(refIso)
  let i = a.findIndex(p => +new Date(p.timestampUtc) > ref)
  if (i < 0) i = a.length - 1
  if (i === 0) i = 1
  const A = a[i - 1] ?? a[0]
  const B = a[i] ?? a[a.length - 1]

  const tA = +new Date(A.timestampUtc), tB = +new Date(B.timestampUtc)
  const r = tB > tA ? (ref - tA) / (tB - tA) : 0
  const lat = A.latitude + (B.latitude - A.latitude) * r
  const lng = A.longitude + (B.longitude - A.longitude) * r
  const heading = rhumbBearingDeg(A.latitude, A.longitude, B.latitude, B.longitude)

  return { ...B, timestampUtc: new Date(ref).toISOString(), latitude: lat, longitude: lng, heading }
}
function rhumbBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (x: number) => x * Math.PI / 180
  const toDeg = (x: number) => x * 180 / Math.PI
  const φ1 = toRad(lat1), φ2 = toRad(lat2)
  let Δλ = toRad(lon2 - lon1)
  if (Math.abs(Δλ) > Math.PI) Δλ = Δλ > 0 ? -(2 * Math.PI - Δλ) : (2 * Math.PI + Δλ)
  const Δψ = Math.log(Math.tan(Math.PI / 4 + φ2 / 2) / Math.tan(Math.PI / 4 + φ1 / 2))
  const θ = Math.atan2(Δλ, Δψ)
  return (toDeg(θ) + 360) % 360
}

/* =========================
   Bileşen
   ========================= */
export default function Dashboard() {
  const [theme, setTheme] = useState<'light' | 'darkSoft' | 'dark'>('darkSoft')
  const [mapStyle, setMapStyle] = useState<'osmLight' | 'darkSoft' | 'dark' | 'satellite'>('darkSoft')
  function styleToTheme(s: typeof mapStyle): typeof theme { if (s === 'osmLight') return 'light'; if (s === 'dark') return 'dark'; return 'darkSoft' }

  // Uçuş durumları
  const [flights, setFlights] = useState<UcusPlani[]>([])
  const [lastPositions, setLastPositions] = useState<Record<number, UcakKonum | null>>({})
  const [trails, setTrails] = useState<Record<number, UcakKonum[]>>({})
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Zaman aralığı (UTC state)
  const [fromUtc, setFromUtc] = useState(() => new Date('2025-01-01T00:00:00Z').toISOString())
  const [toUtc, setToUtc] = useState(() => new Date().toISOString())

  // Mod & slider (UTC)
  const [mode, setMode] = useState<'live' | 'replay'>('live')
  const [displayTime, setDisplayTime] = useState<string>(new Date().toISOString())
  const [isPlaying, setIsPlaying] = useState(false)
  const playTimerRef = useRef<number | null>(null)
  const [playSpeed, setPlaySpeed] = useState<0.5 | 1 | 2 | 4>(1)

  // Takip
  const [isTracking, setIsTracking] = useState(false)
  const [refreshMs, setRefreshMs] = useState<number>(3000)
  const timerRef = useRef<number | null>(null)
  const [refreshSec, setRefreshSec] = useState<number>(refreshMs / 1000)
  useEffect(() => { setRefreshMs(refreshSec * 1000) }, [refreshSec])
  // 🔴 CANLI referans zamanı: **her zaman UTC şimdi** (backend ile birebir)
  const [nowIso, setNowIso] = useState<string>(new Date().toISOString());
  useEffect(() => {
    if (mode !== 'live') return;
    const id = window.setInterval(() => setNowIso(new Date().toISOString()), 1000);
    return () => window.clearInterval(id);
  }, [mode]);
  // 🔵 Canlı modda seçili uçuşun son konumunu sürekli çek
  // Seçili uçuş için canlı polling (refreshSec'e göre)
  useEffect(() => {
    if (mode !== "live" || !selectedId) return;
    const iv = window.setInterval(async () => {
      try {
        const p = await getLastPosition(selectedId);
        if (p) setLastPositions(prev => ({ ...prev, [selectedId]: p }));
      } catch (err) {
        console.error("live polling error", err);
      }
    }, refreshSec * 1000); // ← tüm seçenekleri destekler

    return () => window.clearInterval(iv);
  }, [mode, selectedId, refreshSec]);



  // Çekmeceler
  // Dashboard component FONKSİYONUNUN İÇİNDE (en üstlerde) :
  const [filterOpen, setFilterOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  // Açık çekmece genişliği (px) — hook'lar koşulsuz ve component gövdesinde.
  const [drawerW, setDrawerW] = useState(0);
  useEffect(() => {
    const remeasure = () => {
      // Mobilde kart alttan geldiği için offset 0
      if (window.matchMedia("(max-width: 640px)").matches) { setDrawerW(0); return; }
      const el = document.querySelector<HTMLElement>(".drawerPanel.is-open");
      setDrawerW(el ? el.offsetWidth : 0);
    };
    // ilk ölçüm + resize
    remeasure();
    window.addEventListener("resize", remeasure);
    return () => window.removeEventListener("resize", remeasure);
  }, [filterOpen, plannerOpen, listOpen]);

  const anyDrawerOpen = filterOpen || plannerOpen || listOpen;
  const cardOffset = anyDrawerOpen ? (drawerW + 12) : 12;
  // Kıta filtresi
  const ALL: Continent[] = ['Europe', 'Asia', 'NorthAmerica', 'SouthAmerica', 'Africa', 'Oceania', 'Antarctica', 'Other']
  const [enabledContinents, setEnabledContinents] = useState<Set<Continent>>(new Set(ALL))
  const toggleContinent = (c: Continent) => setEnabledContinents(p => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n })

  // Alt panel
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(true)

  // İlk yükleme
  useEffect(() => {
    (async () => {
      try {
        const list = await getFlights()
        const unique = list.reduce((acc: UcusPlani[], f) => { if (!acc.some(x => x.id === f.id)) acc.push(f); return acc }, [])
        setFlights(unique)
        const pairs: [number, UcakKonum | null][] = await Promise.all(unique.map(async f => [f.id, await getLastPosition(f.id)] as [number, UcakKonum | null]))
        setLastPositions(Object.fromEntries(pairs) as Record<number, UcakKonum | null>)
      } catch (e) { console.error(e); }
    })()
    return () => { if (timerRef.current) window.clearInterval(timerRef.current) }
  }, [])

  // Takip başlat/durdur
  function startTracking() {
    if (timerRef.current) return
    setIsTracking(true)
    timerRef.current = window.setInterval(async () => {
      try {
        const entries = await Promise.all(flights.map(async f => [f.id, await getLastPosition(f.id)] as const))
        setLastPositions(prev => ({ ...prev, ...Object.fromEntries(entries) }))
      } catch (e) { console.error(e) }
    }, refreshMs)
  }
  function stopTracking() { if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null } setIsTracking(false) }
  useEffect(() => { if (isTracking) { stopTracking(); startTracking() } }, [refreshMs]) // eslint-disable-line

  // Geçmiş – tüm uçuşlar
  async function loadHistoryForAll() {
    if (!flights.length) { setStatusMsg('Uçuş yok.'); return }
    if (+new Date(fromUtc) >= +new Date(toUtc)) { setStatusMsg('From, To’dan küçük olmalı.'); return }
    setStatusMsg('Tüm uçuşların rotaları yükleniyor…')
    setTrails({})
    for (const f of flights) {
      const rows = await getRangePositions(f.id, fromUtc, toUtc)
      const ordered = (rows ?? []).slice().sort((a, b) => +new Date(a.timestampUtc) - +new Date(b.timestampUtc))
      setTrails(prev => ({ ...prev, [f.id]: ordered }))
    }
    setMode('replay'); setDisplayTime(new Date(toUtc).toISOString()); setTimelineOpen(true)
    setStatusMsg(`${flights.length} uçuş için rota yüklendi. Kaydırıcıyı kullanabilirsin.`)
  }

  // Seçim/Aralık/Mod değişiminde kısa geçmiş
  useEffect(() => {
    (async () => {
      if (!selectedId) return
      const end = (mode === 'live') ? new Date().toISOString() : displayTime //böylece zaman ilerledikeç değişşr
      const rows = await getRangePositions(selectedId, fromUtc, end)
      const ordered = (rows ?? []).slice().sort((a, b) => +new Date(a.timestampUtc) - +new Date(b.timestampUtc))
      setTrails(prev => ({ ...prev, [selectedId]: ordered }))
    })()
  }, [selectedId, fromUtc, toUtc, mode])

  function ghostPositionFromPlan(f: UcusPlani, refIso: string): UcakKonum | null {
    if (
      f.originLat == null || f.originLng == null ||
      f.destinationLat == null || f.destinationLng == null
    ) return null

    const tA = +new Date(f.startTimeUtc)
    const tB = f.endTimeUtc ? +new Date(f.endTimeUtc) : (tA + 2 * 3600_000)
    const ref = Math.min(Math.max(+new Date(refIso), tA), tB)
    const r = tB > tA ? (ref - tA) / (tB - tA) : 0

    const lat = f.originLat + (f.destinationLat - f.originLat) * r
    const lng = f.originLng + (f.destinationLng - f.originLng) * r

    return {
      id: 0,
      ucusPlaniId: f.id,
      timestampUtc: new Date(ref).toISOString(),
      latitude: lat,
      longitude: lng,
      altitude: 0,
      heading: 0
    }
  }


  /* =========================
     Görünüm kümeleri (UTC referans)
     ========================= */

  //IATA yok; plan koordinatlarıyla ghost
  const displayTrails = Object.fromEntries(
    flights.map(f => {
      // 🔴 CANLI modda hiç ghost üretme:
      if (mode !== 'replay') return [f.id, [] as UcakKonum[]];

      const refIsoGhost = displayTime; // replay’de slider zamanı
      const arr = (trails[f.id] ?? []).slice();

      if (arr.length > 0) {
        const filtered = arr.filter(p => +new Date(p.timestampUtc) <= +new Date(refIsoGhost));
        return [f.id, filtered];
      }

      // (yalnızca REPLAY için) plan-koordinat ghost
      if (
        f.originLat == null || f.originLng == null ||
        f.destinationLat == null || f.destinationLng == null
      ) return [f.id, []];

      const tA = +new Date(f.startTimeUtc);
      const tB = f.endTimeUtc ? +new Date(f.endTimeUtc) : tA + 2 * 3600_000;
      const ref = Math.min(Math.max(+new Date(refIsoGhost), tA), tB);
      const r = tB > tA ? (ref - tA) / (tB - tA) : 0;

      const midLat = f.originLat + (f.destinationLat - f.originLat) * r;
      const midLng = f.originLng + (f.destinationLng - f.originLng) * r;

      return [f.id, [
        { id: 0, ucusPlaniId: f.id, timestampUtc: new Date(tA).toISOString(), latitude: f.originLat, longitude: f.originLng, altitude: 0, heading: 0 },
        { id: 0, ucusPlaniId: f.id, timestampUtc: new Date(ref).toISOString(), latitude: midLat, longitude: midLng, altitude: 0, heading: 0 },
      ]];
    })
  ) as Record<number, UcakKonum[]>;

  //önce trail, sonra DB last, en sonda plan-koordinat ghost
const displayLastPositions: Record<number, UcakKonum | null> = Object.fromEntries(
  flights.map(f => {
    const refIso = (mode === 'replay') ? displayTime : nowIso;

    // 🔵 REPLAY: önce trail interp, yoksa plan-ghost
    if (mode === 'replay') {
      const hasTrail = (trails[f.id]?.length ?? 0) > 0;
      if (hasTrail) {
        const viaTrail = interpAt(trails[f.id], refIso);
        return [f.id, viaTrail];
      }
      // trail yoksa slider anına göre plan-ghost
      return [f.id, ghostPositionFromPlan(f, refIso)];
    }

    // 🔴 LIVE: sadece DB last (ghost yok)
    if (lastPositions[f.id]) return [f.id, lastPositions[f.id]];
    return [f.id, null];
  })
) as Record<number, UcakKonum | null>;



  /* =========================
     Aktif uçuş filtreleme (UTC referans)
     ========================= */
  const minMs = +new Date(fromUtc)
  const maxMs = +new Date(toUtc)
  const displayMs = +new Date(displayTime)
  const clampedDisplayMs = Math.min(Math.max(displayMs, minMs), maxMs)
  const refIso = (mode === 'replay') ? new Date(clampedDisplayMs).toISOString() : nowIso

  const margin = 5 * 60_000; // ±5 dk
  const timeFilteredFlights = flights.filter(f => {
    const t = +new Date(refIso)
    const start = +new Date(f.startTimeUtc) - margin
    const end = f.endTimeUtc ? +new Date(f.endTimeUtc) : Number.POSITIVE_INFINITY
    return true
  })

  const visibleFlightIds = timeFilteredFlights
    .map(f => {
      const pos = displayLastPositions[f.id] ?? null
      const lat = (pos as any)?.latitude ?? (pos as any)?.lat
      const lng = (pos as any)?.longitude ?? (pos as any)?.lng
      const cont = (typeof lat === 'number' && typeof lng === 'number') ? flightContinentFrom(lat, lng) : 'Other'
      return enabledContinents.has(cont) ? f.id : null
    })
    .filter((x): x is number => x !== null)

  const filteredFlights = flights.filter(f => visibleFlightIds.includes(f.id))
  const filteredLastPositions = Object.fromEntries(Object.entries(displayLastPositions).filter(([id]) => visibleFlightIds.includes(Number(id)))) as Record<number, UcakKonum | null>
  const filteredTrails = Object.fromEntries(Object.entries(displayTrails).filter(([id]) => visibleFlightIds.includes(Number(id)))) as Record<number, UcakKonum[]>

  /* Oynatma */
  const totalHours = (maxMs - minMs) / 3_600_000
  const stepSec = totalHours > 72 ? 300 : totalHours > 12 ? 60 : 15
  useEffect(() => {
    if (!isPlaying || mode !== 'replay') return
    if (playTimerRef.current) { window.clearInterval(playTimerRef.current); playTimerRef.current = null }
    const tickMs = 300
    playTimerRef.current = window.setInterval(() => {
      const stepMs = stepSec * 1000 * playSpeed
      const next = Math.min(+new Date(displayTime) + stepMs, maxMs)
      setDisplayTime(new Date(next).toISOString())
      if (next >= maxMs) { setIsPlaying(false); if (playTimerRef.current) { window.clearInterval(playTimerRef.current); playTimerRef.current = null } }
    }, tickMs)
    return () => { if (playTimerRef.current) { window.clearInterval(playTimerRef.current); playTimerRef.current = null } }
  }, [isPlaying, mode, stepSec, playSpeed, displayTime, maxMs])
  useEffect(() => { setIsPlaying(false) }, [fromUtc, toUtc, mode])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        fromUtc={fromUtc} setFromUtc={setFromUtc}
        toUtc={toUtc} setToUtc={setToUtc}
        refreshSec={refreshSec} setRefreshSec={setRefreshSec}
        tracking={isTracking}
        onStart={startTracking}
        onStop={stopTracking}
        onLoadAll={loadHistoryForAll}
        enabledContinents={enabledContinents}
        onToggleContinent={toggleContinent}
        listOpen={listOpen} setListOpen={setListOpen}
        planner={
          <FlightPlanner
            onCreated={(f) => {
              // 1) Listeye yeni planı ekle
              setFlights((prev) => [...prev, f]);

              // 2) Bu uçuşun canlı/trail durumunu sıfırla (sim gelene kadar boş)
              setLastPositions((prev) => ({ ...prev, [f.id]: null }));
              setTrails((prev) => ({ ...prev, [f.id]: [] }));

              // 3) SADECE BİR KEZ ekranda görünmesi için seç
              setSelectedId(f.id);

              // 🚫 ÖNEMLİ: Burada artık konum YAZMIYORUZ.
              // - postPosition YOK
              // - getLastPosition/getRangePositions ile hemen fetch YOK
              // Konum yazmak sadece simülatörün işi olacak.
            }}
          />
        }

        mode={mode}
        setMode={(m) => { setMode(m); if (m === 'live') setDisplayTime(new Date().toISOString()) }}
        theme={theme} setTheme={setTheme}
        mapStyle={mapStyle}
        setMapStyle={(s) => { setMapStyle(s); setTheme(styleToTheme(s)) }}
        filterOpen={filterOpen} setFilterOpen={setFilterOpen}
        plannerOpen={plannerOpen} setPlannerOpen={setPlannerOpen}
        selectedId={selectedId ?? null}
        selectedCode={selectedId ? (flights.find(f => f.id === selectedId)?.code ?? '') : ''}
      />

      {/* Harita */}
      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Map
            flights={filteredFlights}
            lastPositions={filteredLastPositions}
            trails={filteredTrails}
            selectedId={selectedId}
            onSelect={setSelectedId}
            disableAutoFit={isTracking}
            theme={theme}
            mapStyle={mapStyle}
            mode={mode}
          />
        </div>
        <FlightListPanel
          open={listOpen}
          onClose={() => setListOpen(false)}
          flights={flights}
          lastPositions={displayLastPositions}
          mode={mode}
          refIso={mode === "replay" ? displayTime : nowIso}
          onSelect={(id) => { setSelectedId(id); setListOpen(false); }}

        />
        {/* === ALT PANEL — TSİ görünüm === */}
        {timelineOpen ? (
          <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 520 }}>
            <div className="timeline">
              {/* HEAD */}
              <div className="timeline__head">
                <div className="timeline__title">
                  <span style={{ width: 44, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.25)' }} />
                  Zaman Çizgisi & İşlemler (TSİ)
                </div>

                <div className="timeline__controls">
                  <button
                    className="btn btn--ghost"
                    onClick={() => {
                      if (mode !== "replay") return;
                      if (+new Date(displayTime) >= maxMs)
                        setDisplayTime(new Date(minMs).toISOString());
                      setIsPlaying((p) => !p);
                    }}
                    disabled={mode !== "replay"}
                  >
                    {isPlaying ? "Durdur" : "Oynat"}
                  </button>

                  <select
                    value={playSpeed}
                    onChange={(e) => setPlaySpeed(Number(e.target.value) as any)}
                    disabled={mode !== 'replay'}
                    className="btn btn--sm"
                    title="Oynatma hızı"
                  >
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1x</option>
                    <option value={2}>2x</option>
                    <option value={4}>4x</option>
                  </select>

                  <button className="btn btn--ghost btn--sm" onClick={() => { setIsPlaying(false); setDisplayTime(new Date(minMs).toISOString()) }}>En başa</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => { setIsPlaying(false); setDisplayTime(new Date(maxMs).toISOString()) }}>En sona</button>

                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => {
                      setMode('live')
                      setDisplayTime(new Date().toISOString())
                      setStatusMsg('Canlı moda geçtin.')
                      setIsPlaying(false)
                      setTimelineOpen(false)
                    }}
                  >
                    Şimdi (Canlı)
                  </button>

                  <button className="iconBtn--round" onClick={() => setTimelineOpen(false)} title="Kapat">✕</button>
                </div>
              </div>

              {/* DATETIME + ACTIONS — giriş TSİ, state UTC */}
              <div className="timeline__grid">
                <label className="plannerField">
                  <span className="plannerLabel">From (TSİ)</span>
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(new Date(fromUtc))}
                    onChange={(e) => { setIsPlaying(false); setFromUtc(new Date(e.target.value).toISOString()) }}
                    className="plannerInput"
                  />
                </label>

                <label className="plannerField">
                  <span className="plannerLabel">To (TSİ)</span>
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(new Date(toUtc))}
                    onChange={(e) => { setIsPlaying(false); setToUtc(new Date(e.target.value).toISOString()) }}
                    className="plannerInput"
                  />
                </label>

                <div style={{ display: 'flex', gap: 8, alignItems: 'end', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="btn btn--primary btn--sm" onClick={() => { setIsPlaying(false); loadHistoryForAll() }}>Aralığı Yükle (Tümü)</button>
                </div>
              </div>

              {/* STATUS */}
              {statusMsg && <div className="timeline__status">{statusMsg}</div>}

              {/* SLIDER — etiketler TSİ */}
              {mode === 'replay' ? (
                <>
                  <input
                    className="range"
                    type="range"
                    min={minMs}
                    max={maxMs}
                    step={stepSec * 1000}
                    value={clampedDisplayMs}
                    onChange={(e) => { setIsPlaying(false); setDisplayTime(new Date(Number(e.target.value)).toISOString()) }}
                    style={{ backgroundSize: `${((clampedDisplayMs - minMs) / (maxMs - minMs)) * 100}% 100%` }}
                  />
                  <div className="timeline__ticks">
                    <span>{fmtTSI(minMs)}</span>
                    <span style={{ fontWeight: 700 }}>{fmtTSI(clampedDisplayMs)}</span>
                    <span>{fmtTSI(maxMs)}</span>
                  </div>
                </>
              ) : (
                <div className="timeline__status">Canlı moddasın. Geçmiş için “Aralığı Yükle”yi kullan.</div>
              )}
            </div>
          </div>
        ) : (
          // KAPALI – ince bar
          <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 520 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(15,15,15,0.78)', color: '#fff',
              border: '1px solid rgba(255,255,255,.18)', borderRadius: 12,
              padding: '8px 12px', boxShadow: '0 8px 24px rgba(0,0,0,.35)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 44, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.25)' }} />
                <strong style={{ opacity: .92 }}>Zaman Çizgisi & İşlemler (TSİ)</strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn--ghost" onClick={() => setTimelineOpen(true)}>Aç</button>
                <button className="btn btn--ghost" onClick={() => { setIsPlaying(false); setDisplayTime(new Date(minMs).toISOString()) }}>En başa</button>
                <button className="btn btn--ghost" onClick={() => { setIsPlaying(false); setDisplayTime(new Date(maxMs).toISOString()) }}>En sona</button>
                <button
                  className="btn btn--primary"
                  onClick={() => {
                    setMode('live')
                    setDisplayTime(new Date().toISOString())
                    setStatusMsg('Canlı moda geçtin.')
                    setIsPlaying(false)
                  }}
                >
                  Şimdi (Canlı)
                </button>
              </div>
            </div>
          </div>
        )}


        {selectedId && flights.find(f => f.id === selectedId) && (
          <FlightInfoCard
            flight={flights.find(f => f.id === selectedId)!}
            last={displayLastPositions[selectedId] ?? null}
            onClose={() => setSelectedId(null)}
            offsetRightPx={cardOffset}
            selectedTimeUtc={mode === 'replay' ? displayTime : nowIso}
          />
        )}
      </div>
    </div>
  )
}
