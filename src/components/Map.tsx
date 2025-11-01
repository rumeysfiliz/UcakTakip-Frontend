// src/components/Map.tsx
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, useMapEvents, CircleMarker } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { makePlaneIcon } from './AirPlaneIcon'
import type { UcusPlani, UcakKonum } from '../types'
import { colorFor, flightContinentFrom, type Continent, type ThemeMode } from '../lib/continents'
// Map.tsx başına
import { iataNearest } from '../lib/airports';


/* ---------- helpers ---------- */


//Harita ilk açıldığında merkezini center ve yakınlaştırma seviyesini zoom ayarlamak için
function InitialView({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    map.setView(center, zoom, { animate: false }) //haritayı berlrlenen konuma taşıyor.
  }, [map, center, zoom])
  return null
}


//Haritayı ilk hareket ettirdiğimizde algılaması için yani ilk baş zoom yapıyorduk ya uçağa o zoom da kalmasın istediğimiz gibi hareket ettiebilelim ilkten sonra
function InteractionCatcher({ onFirstInteract }: { onFirstInteract: () => void }) {
  const triggered = useRef(false)
  useMapEvents({
    zoomstart() { if (!triggered.current) { triggered.current = true; onFirstInteract() } },
    dragstart() { if (!triggered.current) { triggered.current = true; onFirstInteract() } },
  })
  return null
}

//Veri tabanından gelen konumu Leaflet'in istediği lekilde çeviriyor.
function asLatLng(p?: { latitude?: number; longitude?: number; lat?: number; lng?: number } | null): [number, number] | null {
  if (!p) return null
  const lat = (p as any).latitude ?? (p as any).lat  //Her yerde lat, lng kullanılıyor
  const lng = (p as any).longitude ?? (p as any).lng
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  return [lat, lng]
}

//Tüm uçakları veya noktaları kapsayacak şekilde haritayı otomatik olarak kadraja alıyor
function AutoFit({ points, disabled }: { points: [number, number][]; disabled: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!map || disabled) return
    setTimeout(() => {
      map.invalidateSize()
      if (points.length >= 2) {
        const bounds = points as unknown as LatLngBoundsExpression
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8, animate: false })
      }
    }, 0)
  }, [map, points, disabled])
  return null
}

// Ekrran boyutu veya panel değiştiğinde harita görüntüsü bozulmasın diye (Küçültürken falan)
function InvalidateOnResize() {
  const map = useMap()
  useEffect(() => {
    const onResize = () => map.invalidateSize() //Yeniden boyutlanınca map.invalideteSize() çağırılıyor.
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [map])

  useEffect(() => {
    const parent = map.getContainer().parentElement
    if (!parent) return
    const ro = new ResizeObserver(() => map.invalidateSize())  //Ör bir panel değiştiğinde de boyut güncellenir
    ro.observe(parent)
    return () => ro.disconnect()
  }, [map])

  return null
}

// Uçağa tıkladığında tek seferlik odak yaptığımız yer
function OneShotFocus({ doFocus, path }: { doFocus: boolean; path: [number, number][] }) {
  const map = useMap();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!map || !doFocus || ranRef.current) return;
    ranRef.current = true;

    // 1) Yinelenen noktaları temizle
    const uniq: [number, number][] = [];
    const same = (a: [number, number], b: [number, number]) =>
      Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
    for (const p of path) {
      if (!uniq.length || !same(uniq[uniq.length - 1], p)) uniq.push(p);
    }

    // 2) Haritayı önce güncelle
    map.invalidateSize();

    // 3) Eğer en az 2 farklı nokta varsa fitBounds, yoksa tek noktaya setView
    if (uniq.length >= 2) {
      const bounds = uniq as unknown as LatLngBoundsExpression;
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6, animate: true });
    } else if (uniq.length === 1) {
      map.setView(uniq[0] as any, Math.max(map.getZoom(), 7), { animate: true });
    }

    // 4) 300 ms sonra yeniden tetiklenebilir olsun
    const t = setTimeout(() => { ranRef.current = false; }, 300);
    return () => clearTimeout(t);
  }, [map, doFocus, JSON.stringify(path)]);

  return null;
}


/* ---------- component ---------- */

type Props = {
  flights: UcusPlani[]
  lastPositions: Record<number, UcakKonum | null>
  trails: Record<number, UcakKonum[]> //polylinelar burada üretilsin
  selectedId: number | null
  onSelect: (id: number) => void //Marker/polyline tıklanınca bu uçuş seçildi bilgisi atar
  disableAutoFit?: boolean   // Dashboard'tan: isTracking
  theme?: ThemeMode  // 'light' | 'darkSoft' | 'dark'
  mapStyle?: 'osmLight' | 'darkSoft' | 'dark' | 'satellite'
  mode?: 'live' | 'replay'
}

export default function Map({
  flights,
  lastPositions,
  trails,
  selectedId,
  onSelect,
  disableAutoFit = false,
  theme = 'light', mapStyle = 'osmLight',
  mode = 'live',
}: Props) {
  // TSİ’de HH:mm göster
  const fmtHM = (iso?: string | null) =>
    iso
      ? new Intl.DateTimeFormat("tr-TR", {
        timeZone: "Europe/Istanbul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso))
      : "—";
  const [userLocked, setUserLocked] = useState(false)  //Haritayo ilk kez oynatıldı mı bilfgisi
  const autoFitDisabled = disableAutoFit || userLocked //haritayı elimize aldıysak oto true 
  const stadiaKey = import.meta.env.VITE_STADIA_KEY as string | undefined

  // önceki seçimi hatırla tek seçim şeyi bir dah zıplama
  const prevSelectedRef = useRef<number | null>(null)
  const justSelectedId = selectedId !== null && prevSelectedRef.current !== selectedId ? selectedId : null
  useEffect(() => { prevSelectedRef.current = selectedId }, [selectedId])

  //Tüm uçuşların son konumlarını, rotalarını ve kıta bilgilerini tek bir dizide toplar.
  const items = useMemo(() => {  //Hesaplamalar useMemo sayesinde yalnızca veriler değiştiğinde yeniden yapılıyor.
    return flights.map(f => {
      const last = lastPositions[f.id] ?? null
      const trail = (trails[f.id] ?? []).slice()
      const ll = asLatLng(last)
      const cont: Continent = ll ? flightContinentFrom(ll[0], ll[1]) : 'Other'  //flightContainentFrom ile konum hangi kıtada bulunuyor belirleniyor (renk içinm)
      return { f, last, trail, cont }
    })
  }, [flights, lastPositions, trails]) //hER UÇUŞ İÇİN SON KONUM

  //Haritada gösterdiğimiz çember şeklinde noktaları toplayıp AutoFit'in kullanacağı genel listeyi oluşturuyor
  const allLatLngs: [number, number][] = useMemo(() => {
    const coords: [number, number][] = []  //Koordinatlar coords dizisine ekleniyor
    items.forEach(x => {
      const t = x.trail.length ? x.trail : (x.last ? [x.last] : [])
      t.forEach(p => { const ll = asLatLng(p); if (ll) coords.push(ll) })
    })
    return coords.length ? coords : [[20, 0], [-20, 0]]
  }, [items])

  const initialCenter = useRef<LatLngExpression>([20, 0])
  const initialZoom = useRef<number>(4.5)

  const tile = mapStyle === 'dark' ? {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; OpenStreetMap, &copy; CARTO'
  }
    : mapStyle === 'darkSoft' ? {
      url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png' + (stadiaKey ? `?api_key=${stadiaKey}` : ''),
      attr: '&copy; OpenStreetMap, &copy; OpenMapTiles, &copy; Stadia Maps'
    }
      : mapStyle === 'satellite' ? {
        url: 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg' + (stadiaKey ? `?api_key=${stadiaKey}` : ''),
        attr: '&copy; OpenMapTiles, &copy; OpenStreetMap, &copy; Stadia Maps'
      }
        : {
          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          attr: '&copy; OpenStreetMap contributors'
        };

  //harita
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <MapContainer
        key={`${theme}-${mapStyle}`}
        center={[20, 0]}
        zoom={3.5}
        minZoom={2.5}          // en uzak görünümü kilitle (ekranı doldursun)
        zoomSnap={0.25}
        zoomDelta={0.5}
        style={{ width: '100%', height: '100%' }}
        className="custom-map"
      >
        <InvalidateOnResize />
        <InitialView center={initialCenter.current} zoom={initialZoom.current} />
        <AutoFit points={allLatLngs} disabled={autoFitDisabled} />
        <InteractionCatcher onFirstInteract={() => setUserLocked(true)} />

        <TileLayer key={theme} attribution={tile.attr} url={tile.url} />

        {items.map(({ f, last, trail, cont }) => {
          // 1) trail'den güvenli path üret (sadece ref’e kadar geldiği varsayımıyla)
          const trailSorted = (trail ?? [])
            .filter(p => typeof (p as any)?.timestampUtc === 'string')
            .sort((a, b) => new Date(a.timestampUtc).getTime() - new Date(b.timestampUtc).getTime())

          // yinelenen noktaları sadeleştir
          const uniq: UcakKonum[] = []
          for (const p of trailSorted) {
            if (!uniq.length) { uniq.push(p); continue }
            const prev = uniq[uniq.length - 1]
            const sameTime = Math.abs(+new Date(p.timestampUtc) - +new Date(prev.timestampUtc)) < 2000
            const samePos = Math.abs(p.latitude - prev.latitude) < 1e-5 && Math.abs(p.longitude - prev.longitude) < 1e-5
            if (sameTime && samePos) continue
            uniq.push(p)
          }

          const path = uniq.map(p => [p.latitude, p.longitude] as [number, number])

          const color = colorFor(cont, theme)
          const isSelected = selectedId === f.id

          // Replay modundaysa tüm uçakları çiz, Live modundaysa sadece seçiliyi
          if (mode === "live" && !isSelected) return null

          // 🎯 Çizim koşulu: replay modundaysa tüm uçuşları çiz, live modundaysa sadece seçili
          const shouldDraw =
            isSelected &&
            (
              path.length > 0 ||
              (typeof f.destinationLat === 'number' && typeof f.destinationLng === 'number')
            )

          // 🔥 Stil farkı: seçili uçuş kalın ve opak, diğerleri ince ve yarı saydam
          const lineWeight = isSelected ? 3.5 : 2
          const lineOpacity = isSelected ? 0.95 : 0.4
          const dashOpacity = isSelected ? 0.85 : 0.3

          // 2) plan uçları — IATA yok, doğrudan koordinatlar
          const originLL: [number, number] | null =
            (typeof f.originLat === 'number' && typeof f.originLng === 'number')
              ? [f.originLat, f.originLng]
              : (path[0] ?? null)

          const destLL: [number, number] | null =
            (typeof f.destinationLat === 'number' && typeof f.destinationLng === 'number')
              ? [f.destinationLat, f.destinationLng]
              : null
          // IATA etiketlerini üret (metin varsa onu, yoksa koordinattan en yakın havalimanı)
          const originLabel =
            (f.origin?.trim() || null) ??
            (originLL ? (iataNearest(originLL[0], originLL[1])?.code ?? "—") : "—");

          const destLabel =
            (f.destination?.trim() || null) ??
            (destLL ? (iataNearest(destLL[0], destLL[1])?.code ?? "—") : "—");
          // 3) ref noktası: trail varsa trail'in sonu; yoksa origin (replay başlangıcı gibi düşün)
          const lastLL = asLatLng(last);
          const refLL: [number, number] | null =
            lastLL ?? (path.length ? path[path.length - 1] : originLL);

          if (!refLL) return null

          // 4) KAT EDİLEN: origin → ref (DÜZ)
          let coveredPath: [number, number][] = path.slice();
          if (!coveredPath.length) {
            if (originLL && lastLL) coveredPath = [originLL, lastLL];
            else if (originLL && refLL) coveredPath = [originLL, refLL];
          }
          // === YENİ: coveredPath aynı iki noktaysa tek noktaya indir ===
          // 🔽 Bu kısmı path hesaplarının altına ekle (her uçuşun içinde)
          const same = (a?: [number, number] | null, b?: [number, number] | null): boolean => {
            if (!a || !b) return false;
            return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
          };


          // Odaklanırken kullanılacak güvenli path:
          let focusPath: [number, number][];
          if (coveredPath.length >= 2) {
            const first = coveredPath[0], lastP = coveredPath[coveredPath.length - 1];
            focusPath = (same(first, lastP) ? (refLL ? [refLL] : (originLL ? [originLL] : [])) : coveredPath);
          } else {
            focusPath = refLL ? [refLL] : (originLL ? [originLL] : []);
          }

          // 🔑 REFERANS anahtar: ref noktasının (yaklaşık) konumu + path uzunluğu
          const focusKey =
            `${refLL ? refLL.map(n => n.toFixed(3)).join(',') : 'nil'}|${focusPath.length}`;

          // 5) KALAN: ref → destination (KESİK)
          let remainingPath: [number, number][] = []
          if (destLL) {
            const needRemain = (Math.abs(destLL[0] - refLL[0]) > 1e-6) || (Math.abs(destLL[1] - refLL[1]) > 1e-6)
            if (needRemain) remainingPath = [refLL, destLL]
          }

          // seçim anında bir defa odak
          const doOneShotFocus = justSelectedId === f.id

          /* dünya kopyaları için boylam kaydırmaları */
          const shifts: readonly number[] = isSelected ? ([-360, 0, 360] as const) : ([0] as const);

          return (
            <div key={f.id}>
              {doOneShotFocus && (() => {
                // === YENİ: coveredPath aynı iki noktaysa tek noktaya indir ===
                const sameLL = (a: [number, number], b: [number, number]) =>
                  Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9

                let focusPath: [number, number][]
                if (coveredPath.length >= 2) {
                  const first = coveredPath[0]
                  const last = coveredPath[coveredPath.length - 1]
                  focusPath = sameLL(first, last) ? [refLL] : coveredPath
                } else {
                  focusPath = [refLL]
                }

                return <OneShotFocus doFocus={true} path={focusPath} />
              })()}



              {shifts.map((shift) => {
                const shiftLL = ([lat, lng]: [number, number]) => [lat, lng + shift] as [number, number];
                const coveredShifted = coveredPath.map(shiftLL);
                const remainingShifted = remainingPath.map(shiftLL);
                const shiftedRef = shiftLL(refLL as [number, number]); // üstte zaten `if (!refLL) return null` var

                return (
                  <div key={`${f.id}-${shift}`}>
                    {/* KAT EDİLEN — DÜZ */}
                    {shouldDraw && coveredShifted.length >= 2 && (
                      <Polyline
                        positions={coveredShifted}
                        pathOptions={{ color, weight: lineWeight, opacity: lineOpacity, lineCap: 'round', lineJoin: 'round' }}
                        eventHandlers={{ click: () => onSelect(f.id) }}
                      />
                    )}

                    {/* KALAN — KESİKLİ */}
                    {shouldDraw && remainingShifted.length >= 2 && (
                      <Polyline
                        positions={remainingShifted}
                        pathOptions={{ color, weight: lineWeight, opacity: dashOpacity, dashArray: '6 8', lineCap: 'round', lineJoin: 'round' }}
                        className="route-dash"
                        eventHandlers={{ click: () => onSelect(f.id) }}
                      />
                    )}
                    {/* 🔵 Kalkış / 🔴 Varış çemberleri — sadece SEÇİLİ uçakta göster */}
                    {isSelected && originLL && (
                      <CircleMarker
                        center={shiftLL(originLL) as any}
                        radius={5}
                        pathOptions={{
                          color: '#065f46',         // koyu kenar
                          weight: 2,
                          opacity: 1,
                          fillColor: '#10b9814f',     // yeşil (kalkış)
                          fillOpacity: 0.95,
                        }}
                      >
                        <Tooltip direction="bottom" offset={[0, 8]}>Kalkış</Tooltip>
                      </CircleMarker>
                    )}

                    {isSelected && destLL && (
                      <CircleMarker
                        center={shiftLL(destLL) as any}
                        radius={5}
                        pathOptions={{
                          color: '#7f1d1d',         // koyu kenar
                          weight: 2,
                          opacity: 1,
                          fillColor: '#ef44447c',     // kırmızı (varış)
                          fillOpacity: 0.85,
                        }}
                      >
                        <Tooltip direction="bottom" offset={[0, 8]}>Varış</Tooltip>
                      </CircleMarker>
                    )}
                    {/* ✈️ Replay'de herkes; Live'da sadece seçili */}
                    {(mode === 'replay' || isSelected) && shiftedRef && (
                      <Marker
                        position={shiftedRef as any}
                        opacity={isSelected ? 1 : 0.55}
                        zIndexOffset={isSelected ? 1000 : 0}
                        icon={makePlaneIcon((last as any)?.heading ?? 0, cont, theme, isSelected ? 25 : 18, isSelected ? 1.3 : 1)}
                        eventHandlers={{ click: () => onSelect(f.id) }}
                      >
<Tooltip direction="top" offset={[0, -6]} className="tt-ghost">
  <div className="tt-chip">
    <div className="tt-code">{f.code}</div>
    <div className="tt-route">{originLabel} → {destLabel}</div>
    <div className="tt-time">{fmtHM(f.startTimeUtc)} – {fmtHM(f.endTimeUtc)}</div>
  </div>
</Tooltip>





                      </Marker>
                    )}
                  </div>
                );
              })}

            </div>
          )
        })}

      </MapContainer>
    </div>
  )
}