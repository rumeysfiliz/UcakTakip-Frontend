// Bu sayfa uçuş listesini çeker, her uçuşun son konumunu tutar, replay modunda oynatır, haritaya ve topbar bütün statei bağlar. Uçak kartı burada gösterilir
import { useEffect, useRef, useState } from 'react'
import Map from '../components/Map'
import type { UcusPlani, UcakKonum } from '../types'
import { getFlights, getLastPosition, getRangePositions } from '../api'
import FlightPlanner from '../components/FlightPlanner'
import TopBar from "../components/TopBar"
import "../styles/topbar.css"
import type { Continent } from '../lib/continents'
import { flightContinentFrom } from '../lib/continents'
import FlightInfoCard from "../components/FlightInfoCard"

/* =========================
   TSİ yardımcıları Bu fonk verilen zamanı TSİ çeviriyor.
   ========================= */
function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
   REPLAY interpolasyonu
   (verilen ISO zamandaki ara noktayı hesaplıyor)
   ========================= */
function interpAt(arr: UcakKonum[] | undefined, refIso: string): UcakKonum | null {
  const a = (arr ?? []).slice()
  if (!a.length) return null

  a.sort((x, y) => +new Date(x.timestampUtc) - +new Date(y.timestampUtc))

  const ref = +new Date(refIso)
  let i = a.findIndex(p => +new Date(p.timestampUtc) > ref)
  if (i < 0) return a[a.length - 1]
  if (i === 0) return a[0]

  const A = a[i - 1], B = a[i]
  const tA = +new Date(A.timestampUtc), tB = +new Date(B.timestampUtc)
  const r = tB > tA ? (ref - tA) / (tB - tA) : 0

  return {
    ...B,
    timestampUtc: new Date(ref).toISOString(),
    latitude: A.latitude + (B.latitude - A.latitude) * r,
    longitude: A.longitude + (B.longitude - A.longitude) * r,
  }
}

//Harita / tema stilleri
export default function Dashboard() {
  const [theme, setTheme] = useState<'light' | 'darkSoft' | 'dark'>('darkSoft')
  const [mapStyle, setMapStyle] = useState<'osmLight' | 'darkSoft' | 'dark' | 'satellite'>('darkSoft')

  function styleToTheme(s: typeof mapStyle): typeof theme {
    if (s === 'osmLight') return 'light'
    if (s === 'dark') return 'dark'
    // 'darkSoft' ve 'satellite' -> yumuşak koyu
    return 'darkSoft'
  }

  //Uçak konum state'leri
  const [flights, setFlights] = useState<UcusPlani[]>([])
  const [lastPositions, setLastPositions] = useState<Record<number, UcakKonum | null>>({})
  const [trails, setTrails] = useState<Record<number, UcakKonum[]>>({}) //geçmiş rota noktaları (replay çizfi)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Zaman aralığı (UTC state) Backend/DB uyumlu olsun diye
  const [fromUtc, setFromUtc] = useState(() => new Date('2025-01-01T00:00:00Z').toISOString());
  const [toUtc, setToUtc] = useState(() => new Date().toISOString());

  // Genel durumlar 
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mod & slider zamanı (UTC state)
  const [mode, setMode] = useState<'live' | 'replay'>('live')
  const [displayTime, setDisplayTime] = useState<string>(new Date().toISOString())

  // Replay oynatma kontrolü
  const [isPlaying, setIsPlaying] = useState(false) //slider oto akıyor mu?
  const playTimerRef = useRef<number | null>(null) //başlat/durdur
  const [playSpeed, setPlaySpeed] = useState<0.5 | 1 | 2 | 4>(1)

  // Canlı takip periyodik son konum çekimi
  const [isTracking, setIsTracking] = useState(false)
  const [refreshMs, setRefreshMs] = useState<number>(3000)
  const timerRef = useRef<number | null>(null)

  // TopBar ayar saniye cinsinden gelir içerde çevirip gerçek ara süresini günceller.
  const [refreshSec, setRefreshSec] = useState<number>(refreshMs / 1000)
  useEffect(() => { setRefreshMs(refreshSec * 1000) }, [refreshSec])

  // Filtre ve planlayıcı çekmeceleri açılıp kapanması
  const [filterOpen, setFilterOpen] = useState(false)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [panelW, setPanelW] = useState(() => Math.min(460, Math.round(window.innerWidth * 0.92)))
  useEffect(() => {
    const onResize = () => setPanelW(Math.min(460, Math.round(window.innerWidth * 0.92)))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const cardOffset = (plannerOpen || filterOpen) ? panelW + 12 : 12  //Çekmece açıksa uçuş kartını sola kaydırıyor

  // Kıta filtresi
  const ALL: Continent[] = ['Europe', 'Asia', 'NorthAmerica', 'SouthAmerica', 'Africa', 'Oceania', 'Antarctica', 'Other']
  const [enabledContinents, setEnabledContinents] = useState<Set<Continent>>(new Set(ALL))
  const toggleContinent = (c: Continent) => {
    setEnabledContinents(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })
  }

  // Alt panel replay geçildiğinde zaman panelinin oto-açılması
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(true)
  useEffect(() => { if (mode === 'replay') setTimelineOpen(true) }, [mode])

  // İlk yükleme - Uçuş listesi ve son konumlar
  useEffect(() => {
    (async () => {
      try {
        const list = await getFlights();

        //  benzersiz (id) 
        const unique = list.reduce((acc: UcusPlani[], f) => {
          if (!acc.some(x => x.id === f.id)) acc.push(f);
          return acc;
        }, []);
        setFlights(unique);

        //  lastPositions her uçuş için son konym kurulup harita doldurulur
        const pairs: [number, UcakKonum | null][] = await Promise.all(
          unique.map(async (f) => [f.id, await getLastPosition(f.id)] as [number, UcakKonum | null])
        );
        setLastPositions(Object.fromEntries(pairs) as Record<number, UcakKonum | null>);
      } catch (e) {
        console.error(e);
        setError('Uçuş listesi/konumlar alınamadı.');
      }
    })();

    return () => { if (timerRef.current) window.clearInterval(timerRef.current) };
  }, []);

  // Canlı takip başlat/durdur + refresh değişimi
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
  function stopTracking() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
    setIsTracking(false)
  }
  useEffect(() => { if (isTracking) { stopTracking(); startTracking() } }, [refreshMs]) // eslint-disable-line

  // Geçmiş – tüm uçuşlar Seçilen aralık için tüm uçuşların rota noktalarını indirir, zaman sırasına dizer, trails’a koyar ve replay’e geçer; slider’ı toUtc’a getirir.
  async function loadHistoryForAll() {
    if (!flights.length) { setStatusMsg('Uçuş yok.'); return }
    if (new Date(fromUtc).getTime() >= new Date(toUtc).getTime()) { setStatusMsg('From, To’dan küçük olmalı.'); return }
    setLoading(true); setError(null); setTrails({}); setStatusMsg('Tüm uçuşların rotaları yükleniyor…')
    try {
      for (const f of flights) {
        const rows = await getRangePositions(f.id, fromUtc, toUtc)
        const ordered = (rows ?? []).slice().sort((a, b) => +new Date(a.timestampUtc) - +new Date(b.timestampUtc))
        setTrails(prev => ({ ...prev, [f.id]: ordered }))
      }
      setMode('replay'); setDisplayTime(new Date(toUtc).toISOString())
      setStatusMsg(`${flights.length} uçuş için rota yüklendi. Kaydırıcıyı kullanabilirsin.`)
      setTimelineOpen(true)
    } catch { setError('Geçmiş rotalar yüklenirken hata.'); setStatusMsg('Yükleme sırasında hata oluştu.') }
    finally { setLoading(false) }
  }

  // Geçmiş – seçili uçuş Canlıdaysa end = şimdi, replay’de end = toUtc.
  async function loadHistoryForSelected() {
    if (!selectedId) { setStatusMsg('Önce haritadan bir uçuş seç.'); return; }

    const fromMs = +new Date(fromUtc), toMs = +new Date(toUtc);
    if (fromMs >= toMs && mode === 'replay') { setStatusMsg('From, To’dan küçük olmalı.'); return; }

    setLoading(true); setError(null); setStatusMsg(`Seçili #${selectedId} için rota yükleniyor…`);

    try {
      const end = (mode === 'live') ? new Date().toISOString() : toUtc;
      const rows = await getRangePositions(selectedId, fromUtc, end);
      const ordered = (rows ?? []).slice().sort(
        (a, b) => +new Date(a.timestampUtc) - +new Date(b.timestampUtc)
      );

      if (!ordered.length) {
        setTrails(prev => ({ ...prev, [selectedId]: [] }));
        setMode('replay'); setTimelineOpen(true); setDisplayTime(end);
        setStatusMsg('Bu aralıkta seçili uçuş için veri yok.');
        return;
      }

      setTrails({ [selectedId]: ordered });
      setMode('replay'); setTimelineOpen(true); setDisplayTime(end);
      setStatusMsg('Seçili uçuşun rotası yüklendi. Kaydırıcıyı kullanabilirsin.');
    } catch {
      setError('Seçili uçuş geçmişi yüklenemedi.'); setStatusMsg('Yüklenemedi.');
    } finally { setLoading(false); }
  }

  //Rotaları temizleme Tüm rotaları kaldırır seçimleri sıfırlar, canlı döner, oynatmayı durdurur.
  function clearTrails() {
    setTrails({}); setSelectedId(null); setMode('live')
    setStatusMsg('Rotalar temizlendi. Canlı moda döndün.')
    setIsPlaying(false)
  }

  // Haritada bir uçak seçtiğinde veya zaman aralığı/mod değiştiğinde o uçuşun hızlı bir geçmişini indirir ki rota hemen çizilsin. Anında görsel geri bildirim vermek için.
  useEffect(() => {
    (async () => {
      if (!selectedId) return;
      try {
        const end = (mode === 'live') ? new Date().toISOString() : toUtc;
        const rows = await getRangePositions(selectedId, fromUtc, end);
        const ordered = (rows ?? []).slice().sort(
          (a, b) => +new Date(a.timestampUtc) - +new Date(b.timestampUtc)
        );
        setTrails(prev => ({ ...prev, [selectedId]: ordered }));
      } catch (e) { console.error(e); }
    })();
  }, [selectedId, fromUtc, toUtc, mode]);

  /* =========================
     REPLAY görünümü kümeleri
     Replay modunda her uçuşun rotasını slider anına kadar filtreler. Örn. slider 12:10 ise, 12:10’dan sonraki noktalar geçici olarak gizlenir; çizgi sadece geçmişi gösterir.
     ========================= */
  const displayTrails = mode === 'replay'
    ? Object.fromEntries(Object.entries(trails).map(([id, arr]) => {
      const t = +new Date(displayTime)
      const filtered = (arr ?? []).filter(p => +new Date(p.timestampUtc) <= t)
      return [Number(id), filtered]
    }))
    : trails

  //Replay modunda marker konumları için interpAt ile tam slider anındaki ara noktayı hesaplıypo
  const displayLastPositions: Record<number, UcakKonum | null> =
    mode === 'replay'
      ? Object.fromEntries(
        Object.entries(trails).map(([id, arr]) => [Number(id), interpAt(arr, displayTime)])
      )
      : lastPositions

  /* =========================
     ——— ÖNEMLİ DÜZENLEME ———
     Sadece referans anda (canlı: now, replay: displayTime) AKTİF olan uçuşları göster.
     Böylece aynı kodlu farklı gün planları aynı anda görünmez.
     ========================= */
  const refTime = mode === 'replay' ? new Date(displayTime) : new Date()
  function isActiveAt(f: UcusPlani, ref: Date) {
    const start = +new Date(f.startTimeUtc)
    const end = f.endTimeUtc ? +new Date(f.endTimeUtc) : Number.POSITIVE_INFINITY
    const t = +ref
    return t >= start && t <= end
  }

  // 1) Zaman filtresi
  const timeFilteredFlights = flights.filter(f => isActiveAt(f, refTime))

  // 2) Kıta filtresi (o anki marker konumuna göre)
  const visibleFlightIds = timeFilteredFlights
    .map(f => {
      const pos = (mode === 'replay' ? displayLastPositions[f.id] : lastPositions[f.id]) ?? null
      const lat = (pos as any)?.latitude ?? (pos as any)?.lat
      const lng = (pos as any)?.longitude ?? (pos as any)?.lng
      const cont = (typeof lat === 'number' && typeof lng === 'number') ? flightContinentFrom(lat, lng) : 'Other'
      return enabledContinents.has(cont) ? f.id : null
    })
    .filter((x): x is number => x !== null)

  //Haritaya sadece seçili kıtalardaki uçuşları, onların son konumlarını ve rotalarını gönderiyor
  const filteredFlights = flights.filter(f => visibleFlightIds.includes(f.id))
  const filteredLastPositions = Object.fromEntries(
    Object.entries(displayLastPositions).filter(([id]) => visibleFlightIds.includes(Number(id)))
  ) as Record<number, UcakKonum | null>
  const filteredTrails = Object.fromEntries(
    Object.entries(displayTrails).filter(([id]) => visibleFlightIds.includes(Number(id)))
  ) as Record<number, UcakKonum[]>


  /* Slider için başlangıç-bitiş millisaniyeye çevrilir. Aralığın uzunluğuna göre step (adım) seçer: 72 saat ise 300 sn (5 dk) 12 saat ise 60 sn değilse 15 sn*/
  const minMs = +new Date(fromUtc)
  const maxMs = +new Date(toUtc)
  const totalHours = (maxMs - minMs) / 3_600_000
  const stepSec = totalHours > 72 ? 300 : totalHours > 12 ? 60 : 15
  const displayMs = +new Date(displayTime)
  const clampedDisplayMs = Math.min(Math.max(displayMs, minMs), maxMs) //Clamp: slider değerinin her zaman [min,max] içinde kalmasını garanti eder.

  //Oynatma (replay). -> OynatmA aktifse ve mod replay ise bir interval(ara) kurar. Her 300ms'de birdisplayTime’ı stepSec * playSpeed kadar ileri taşır. maxMs’i geçerse oynatmayı durdurur ve interval’i temizler. 
  useEffect(() => {
    if (!isPlaying || mode !== 'replay') return
    if (playTimerRef.current) { window.clearInterval(playTimerRef.current); playTimerRef.current = null }

    const tickMs = 300
    playTimerRef.current = window.setInterval(() => {
      const stepMs = stepSec * 1000 * playSpeed
      const next = Math.min(+new Date(displayTime) + stepMs, maxMs)
      setDisplayTime(new Date(next).toISOString())
      if (next >= maxMs) {
        setIsPlaying(false)
        if (playTimerRef.current) { window.clearInterval(playTimerRef.current); playTimerRef.current = null }
      }
    }, tickMs)

    return () => {
      if (playTimerRef.current) { window.clearInterval(playTimerRef.current); playTimerRef.current = null }
    }
  }, [isPlaying, mode, stepSec, playSpeed, displayTime, maxMs])

  // Aralık/mod değişince oynatmayı kesiyo From/To aralığı veya mod değiştiğinde otomatik olarak oynatmayı kapatır.
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
        onLoadSelected={loadHistoryForSelected}
        onClearTrails={clearTrails}
        enabledContinents={enabledContinents}
        onToggleContinent={toggleContinent}
        planner={<FlightPlanner onCreated={(f) => setFlights(prev => [...prev, f])} />}
        mode={mode}
        setMode={(m) => { setMode(m); if (m === 'live') setDisplayTime(new Date().toISOString()) }}
        theme={theme} setTheme={setTheme}
        mapStyle={mapStyle}
        setMapStyle={(s) => { setMapStyle(s); setTheme(styleToTheme(s)) }} filterOpen={filterOpen} setFilterOpen={setFilterOpen}
        plannerOpen={plannerOpen} setPlannerOpen={setPlannerOpen}
        selectedId={selectedId ?? null}
        selectedCode={selectedId ? (flights.find(f => f.id === selectedId)?.code ?? '') : ''}
      />

      {/* Harita */}
      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Map
            flights={filteredFlights}
            lastPositions={filteredLastPositions}   // marker’lar → tam slider anı (interp)
            trails={filteredTrails}                // çizgi → seçili ana kadar
            selectedId={selectedId}
            onSelect={setSelectedId}
            disableAutoFit={isTracking}
            theme={theme}
            mapStyle={mapStyle}
          />
        </div>

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
                  <button className="btn btn--sm" onClick={() => { setIsPlaying(false); loadHistoryForSelected() }} disabled={!selectedId}>Sadece Seçili Uçuş</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => { setIsPlaying(false); clearTrails() }}>Temizle</button>
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

        {/* Uçuş kartı */}
        {selectedId && flights.find(f => f.id === selectedId) && (
          <FlightInfoCard
            flight={flights.find(f => f.id === selectedId)!}
            last={mode === 'replay'
              ? (displayLastPositions[selectedId] ?? null)  // slider anına göre
              : (lastPositions[selectedId] ?? null)}        // canlı son konum
            onClose={() => setSelectedId(null)}
            offsetRightPx={cardOffset}
            selectedTimeUtc={mode === 'replay' ? displayTime : null}
          />
        )}
      </div>
    </div>
  )
}
