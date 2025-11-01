import React from "react"
import type { UcusPlani, UcakKonum } from "../types"
import { fmtTurkeyTime, toTurkeyTime } from "../lib/time"
import { iataNearest } from "../lib/airports"


type Props = {
  flight: UcusPlani
  last: UcakKonum | null  //Uçağın “görüntülenen ana” ait son/ara konum kaydı.
  onClose: () => void  //Kapat tuşu
  offsetRightPx?: number //Sağda başka bir panel (TopBar çekmecesi, planner vs.) açıldığında kartın sağdan boşluğunu arttırıp çakışmayı engellemek için.
  selectedTimeUtc?: string | null // Replay modundaki slider zamanı; varsa kart “o ana” göre hesap yapıyor, yoksa “şimdi”yi kullanıyor.
}


//İlerleme oranı hesaplanırken taşma olmasın diye min max
function clamp(n: number, min = 0, max = 1) { return Math.max(min, Math.min(max, n)) }

//Kartın tüm yaşam döngüsü ve render'ı burada.
export default function FlightInfoCard({
  flight, last, onClose, offsetRightPx, selectedTimeUtc
}: Props) {
  // Referans zaman: replay’de slider anı; canlıda şimdi. Bir sonraki blokta durum/ilerleme/süre hesapları hep bu üç değişkenle yapılır.
  const ref = selectedTimeUtc ? new Date(selectedTimeUtc) : new Date()
  const start = new Date(flight.startTimeUtc)
  const plannedEnd = flight.endTimeUtc ? new Date(flight.endTimeUtc) : null

  // Durum + süre + ilerleme (ref zamana göre)
  let statusLabel = "—"
  let durationText = "—"  //planlanan toplam süre
  let progress = 0  //devam ediyorda yüzdelik
  if (ref < start) {
    statusLabel = "Planlandı"
    progress = 0
    if (plannedEnd) durationText = `${((plannedEnd.getTime() - start.getTime()) / 36e5).toFixed(1)} saat`
  } else if (plannedEnd && ref >= plannedEnd) {
    statusLabel = "Tamamlandı"
    progress = 1
    durationText = `${((plannedEnd.getTime() - start.getTime()) / 36e5).toFixed(1)} saat`
  } else {
    statusLabel = "Devam ediyor"

    // Eğer planlı bitiş yoksa, tahmini bitiş olarak 2x süre varsayalım
    const endForCalc = plannedEnd
      ? plannedEnd
      : new Date(start.getTime() + (ref.getTime() - start.getTime()) * 2)
    progress = endForCalc <= start ? 0 :
      clamp((ref.getTime() - start.getTime()) / (endForCalc.getTime() - start.getTime()))
    durationText = `${((ref.getTime() - start.getTime()) / 36e5).toFixed(1)} saat`
  }

  //İlerleme bandı için burası 
  const progressColor =
    statusLabel === "Tamamlandı" ? "#10b981" :
      statusLabel === "Planlandı" ? "rgba(255,255,255,.35)" :
        "#3b82f6"
  //Üst bar/filtre/planlayıcı açıkken kartın sağa kaymasını sağlıyor. (Çakışma oluyordu )
  const rightGap = typeof offsetRightPx === "number" ? offsetRightPx : 12
  // flight: UcusPlani
  const originLabel =
    (flight.origin?.trim() || null) ??
    ((typeof flight.originLat === "number" && typeof flight.originLng === "number")
      ? (iataNearest(flight.originLat, flight.originLng)?.code ?? null)
      : null) ??
    "Bilinmiyor";

  const destLabel =
    (flight.destination?.trim() || null) ??
    ((typeof flight.destinationLat === "number" && typeof flight.destinationLng === "number")
      ? (iataNearest(flight.destinationLat, flight.destinationLng)?.code ?? null)
      : null) ??
    "Bilinmiyor";

  //Kart ayarları/düzenlemeleri/hareketleri
  return (
    <aside
      style={{
        position: "fixed", top: 60, right: rightGap, transition: "right .28s ease",
        width: 360, maxWidth: "92vw", padding: 14, color: "#eef3f5",
        background: "rgba(18,28,26,.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        border: "1px solid rgba(255,255,255,.14)", borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,.38)",
        zIndex: 2000, pointerEvents: "auto",
      }}
    >
      {/* Kapatma butonu  */}
      <button
        onClick={onClose} aria-label="Kapat" title="Kapat"
        style={{
          position: "absolute", top: 8, right: 8, width: 30, height: 30, padding: 0,
          border: "1px solid rgba(255,255,255,.22)", borderRadius: 9999,
          background: "rgba(0,0,0,.35)", color: "#fff", cursor: "pointer",
          display: "grid", placeItems: "center", lineHeight: 0, boxShadow: "0 2px 8px rgba(0,0,0,.35)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Başlık. Uçuş kodu - Başlangıç - Bitiş */}
      <div style={{ fontWeight: 800, letterSpacing: 0.2, fontSize: 18, marginRight: 38, marginBottom: 8 }}>
        {flight.code} — {originLabel} → {destLabel}      </div>

      {/* Orta blok. Kalkış - ikon - varış */}
      <div
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "rgba(255,255,255,.06)", borderRadius: 12, padding: "10px 12px", marginBottom: 10
        }}
      >
        <div style={{ textAlign: "center", minWidth: 120 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{flight.origin}</div>
          <div style={{ opacity: .85 }}>
            {new Intl.DateTimeFormat("tr-TR", {
              timeZone: "Europe/Istanbul",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(toTurkeyTime(flight.startTimeUtc))} TSİ
          </div>          
          <div style={{ fontSize: 12, color: progressColor }}>{statusLabel}</div>
        </div>
        {/* orta ikon (GIF, düzen sabit) */}
        <div aria-hidden style={{ opacity: .95, width: 86, height: 86, display: "grid", placeItems: "center" }}>
          <img
            src="the-plane-13509.gif"
            alt=""
            width={86}
            height={86}
            style={{ display: "block", imageRendering: "auto" }}
          />
        </div>

        <div style={{ textAlign: "center", minWidth: 120 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{flight.destination}</div>
          <div style={{ opacity: .85 }}>
            {new Intl.DateTimeFormat("tr-TR", {
              timeZone: "Europe/Istanbul",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(toTurkeyTime(flight.endTimeUtc ?? new Date().toISOString()))} TSİ
          </div>

          <div style={{ fontSize: 12, color: progressColor }}>{statusLabel}</div>
        </div>
      </div>
      {/* İlerleme barı — Star Wars tarzı (ok uçlu, ignition animasyonlu) */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 14,
          marginBottom: 10,
          borderRadius: 8,
          overflow: "hidden",
          background: "rgba(255,255,255,.08)",
        }}
      >
        <div
          style={{
            position: "relative",
            width: `calc(${Math.max(0, Math.min(100, progress * 100))}% )`,
            height: "100%",
            transition: "width .4s ease-out",
            animation: "saberIgnite .8s ease-out",
          }}
        >
          {/* glow (renkli aura) */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              transform: "translateY(-50%)",
              width: "100%",
              height: 12,
              borderRadius: 999,
              background: `linear-gradient(90deg,
          rgba(243, 249, 93, 1),
          ${progressColor} 20%,
          #f1d45fa9 50%,
          ${progressColor} 80%,
          rgba(81, 255, 0, 0.98))`,
              filter: "blur(6px)",
              opacity: 0.95,
              animation: "saberHum 1.8s ease-in-out infinite",
            }}
          />

          {/* beyaz core */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              transform: "translateY(-50%)",
              width: "100%",
              height: 4,
              borderRadius: 999,
              background: "linear-gradient(90deg, rgba(245, 237, 194, 0.9), #fff, rgba(248, 246, 238, 0.9))",
              boxShadow: "0 0 12px #f95e1cff",
              zIndex: 1,
            }}
          />

          {/* uç kısım — ok ucu */}
          <div
            style={{
              position: "absolute",
              right: -6,
              top: "50%",
              transform: "translateY(-50%)",
              width: 0,
              height: 0,
              borderTop: "7px solid transparent",
              borderBottom: "7px solid transparent",
              borderLeft: `10px solid ${progressColor}`,
              boxShadow: `0 0 12px ${progressColor}, 0 0 20px ${progressColor}`,
              animation: "saberTip 1.2s ease-in-out infinite alternate",
            }}
          />
        </div>

        <style>
          {`
      @keyframes saberHum {
        0%   { opacity: .85; filter: blur(5px); }
        50%  { opacity: 1;   filter: blur(6px); }
        100% { opacity: .85; filter: blur(5px); }
      }
      @keyframes saberTip {
        0%   { transform: translateY(-50%) scale(0.9); opacity: .9; }
        100% { transform: translateY(-50%) scale(1.05); opacity: 1; }
      }
      @keyframes saberIgnite {
        0%   { width: 0; opacity: 0.6; }
        100% { width: 100%; opacity: 1; }
      }
    `}
        </style>
      </div>


      {/* Üst grid */}
      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", columnGap: 15, rowGap: 8, fontSize: 13 }}>
        <div style={{ opacity: .75, fontWeight: 600 }}>ID</div>
        <div style={{ fontVariantNumeric: "tabular-nums" }}>{flight.id}</div>

        <div style={{ opacity: .75, fontWeight: 600 }}>Başlangıç (TSİ)</div>
        <div>{fmtTurkeyTime(flight.startTimeUtc)}</div>

        {flight.endTimeUtc && (
          <>
            <div style={{ opacity: .75, fontWeight: 600 }}>Bitiş (TSİ)</div>
            <div>{fmtTurkeyTime(flight.endTimeUtc)}</div>
          </>
        )}
        <div style={{ opacity: .75, fontWeight: 600 }}>Durum</div>
        <div>{statusLabel}</div>

        <div style={{ opacity: .75, fontWeight: 600 }}>Süre</div>
        <div>{durationText}</div>
      </div>

      <div style={{ height: 3, background: "rgba(255,255,255,.12)", margin: "10px 0 10px" }} />

      {/* Alt grid: Son konum */}
      {last ? (
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", columnGap: 10, rowGap: 6, fontSize: 13 }}>
          <div style={{ opacity: .75, fontWeight: 600 }}>Son kayıt (TSİ)</div>
          <div>{fmtTurkeyTime(last.timestampUtc)}</div>
          <div style={{ opacity: .75, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-8 7-12a7 7 0 10-14 0c0 4 7 12 7 12z" stroke="currentColor" strokeWidth="2" /></svg>
            Konum
          </div>
          <div style={{ fontVariantNumeric: "tabular-nums" }}>
            {last.latitude.toFixed(4)}, {last.longitude.toFixed(4)}
          </div>

          <div style={{ opacity: .75, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            İrtifa
          </div>
          <div style={{ fontVariantNumeric: "tabular-nums" }}>
            {last.altitude ?? "—"} m
          </div>

          <div style={{ opacity: .75, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3a9 9 0 110 18 9 9 0 010-18zm4 4l-3 7-7 3 3-7 7-3z" stroke="currentColor" strokeWidth="2" /></svg>
            Yön
          </div>
          <div style={{ fontVariantNumeric: "tabular-nums" }}>
            {(last as any).heading ?? "—"}°
          </div>
        </div>
      ) : (
        <div style={{ opacity: .85, fontSize: 13 }}>Bu anda görüntülenecek konum yok.</div>
      )}
    </aside>
  )
}
