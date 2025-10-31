// src/components/Map.tsx
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, useMapEvents, CircleMarker } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { makePlaneIcon } from './AirPlaneIcon'
import type { UcusPlani, UcakKonum } from '../types'
import { colorFor, flightContinentFrom, type Continent, type ThemeMode } from '../lib/continents'

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
  const map = useMap()
  const ranRef = useRef(false)

  useEffect(() => {
    if (!map || !doFocus || ranRef.current) return //Uçak seçildiğinde doFocus devreye girer
    ranRef.current = true //ranRef sayesinde işlem tekrar etmez

    if (path.length >= 2) {
      const bounds = path as unknown as LatLngBoundsExpression
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6, animate: true })
    } else if (path.length === 1) {
      map.setView(path[0] as any, Math.max(map.getZoom(), 6), { animate: true })
    }
    // küçük bir süre sonra flag’i sıfırla ki başka seçim olunca tekrar çalışabilsin
    const t = setTimeout(() => { ranRef.current = false }, 300)
    return () => clearTimeout(t)
  }, [map, doFocus, JSON.stringify(path)])

  return null
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
}

export default function Map({
  flights,
  lastPositions,
  trails,
  selectedId,
  onSelect,
  disableAutoFit = false,
  theme = 'light', mapStyle = 'osmLight' }: Props) {

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
          const lastLL = asLatLng(last)
          if (!lastLL) return null

          // 1) TRAIL + LAST → zaman sırasına göre tek listen -- iz geçmiş noktalar
          const merged = [...trail, ...(last ? [last] : [])]
            .filter(p => typeof (p as any).timestampUtc === 'string')
            .sort((a, b) => new Date(a.timestampUtc).getTime() - new Date(b.timestampUtc).getTime())

          // Plan (start–end) dışında kalan noktaları at
          const startMs = +new Date(f.startTimeUtc)
          const endMs = f.endTimeUtc ? +new Date(f.endTimeUtc) : Number.POSITIVE_INFINITY
          const mergedClamped = merged.filter(p => {
            const t = +new Date(p.timestampUtc)
            return t >= startMs && t <= endMs
          })

          // Ardışık yinelenen noktaları tekilleştirmek  aynı zaman veya aynı konum tekrarı var ise atlanır.
          const uniq: UcakKonum[] = []
          for (const p of mergedClamped) {
            if (!uniq.length) { uniq.push(p); continue }
            const prev = uniq[uniq.length - 1]
            const sameTime = Math.abs(+new Date(p.timestampUtc) - +new Date(prev.timestampUtc)) < 2000; // 2sn tolerans
            const samePos = Math.abs(p.latitude - prev.latitude) < 1e-5 && Math.abs(p.longitude - prev.longitude) < 1e-5;
            if (sameTime && samePos) continue
            uniq.push(p)
          }
          const path = uniq.map(p => asLatLng(p)).filter(Boolean) as [number, number][]
          const color = colorFor(cont, theme)
          const isSelected = selectedId === f.id
          const shouldDraw = isSelected && path.length > 1

          // büyük-daire istersek:
          const curved = path

          // sadece yeni seçildiği anda 1 kere odakla
          const doOneShotFocus = justSelectedId === f.id

          //Haritanın ana çizim kısmı
          return (
            <div key={f.id}>
              {/* sadece yeni seçildiği anda 1 kere odakla (ana kopyaya) */}
              {doOneShotFocus && <OneShotFocus doFocus={true} path={curved.length ? curved : (lastLL ? [lastLL] : [])} />}

              {/* kopya dünyalar için boylam kaydırmaları */}
              {([-1800, -1440, -1080, -720, -360, 0, 360, 720, 1080, 1440, 1800] as const).map((shift) => {
                const shiftedPath = path.map(([lat, lng]) => [lat, lng + shift]) as [number, number][];
                const shiftedLast = [lastLL[0], lastLL[1] + shift] as [number, number];

                return (
                  <div key={`${f.id}-${shift}`}>
                    {shouldDraw && (
                      <>
                        <Polyline
                          positions={shiftedPath}
                          pathOptions={{
                            color,
                            weight: 2,
                            opacity: 0.9,
                            dashArray: '4 8',
                            lineCap: 'round',
                            lineJoin: 'round',
                          }}
                          className="route-dash"
                          eventHandlers={{ click: () => onSelect(f.id) }}
                        />
                        <CircleMarker center={shiftedPath[0] as any} radius={5} pathOptions={{ color: '#10b981', weight: 2 }} />
                        <CircleMarker center={shiftedPath[shiftedPath.length - 1] as any} radius={5} pathOptions={{ color: '#ef4444', weight: 2 }} />
                      </>
                    )}

                    <Marker
                      position={shiftedLast as any}
                      icon={makePlaneIcon(
                        (last as any)?.heading ?? 0,
                        cont,
                        theme,
                        isSelected ? 25 : 22,
                        isSelected ? 1.3 : 1.2
                      )}
                      eventHandlers={{ click: () => onSelect(f.id) }}
                    >
                      <Tooltip direction="top" offset={[0, -8]}>
                        <div>
                          <b>{f.code}</b><br />
                          {f.origin} → {f.destination}
                          <div style={{ opacity: .8, fontSize: 12 }}>
                            {new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', month: '2-digit', day: '2-digit' })
                              .format(new Date(f.startTimeUtc))}
                          </div>
                        </div>
                      </Tooltip>
                    </Marker>
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