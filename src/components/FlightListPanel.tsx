import { useMemo, useState } from "react";
import type { UcusPlani, UcakKonum } from "../types";
import { iataNearest } from "../lib/airports";

type Props = {
    open: boolean;
    onClose: () => void;
    flights: UcusPlani[];
    lastPositions: Record<number, UcakKonum | null>;
    mode: "live" | "replay";
    refIso: string;                // live: nowIso, replay: displayTime
    onSelect: (id: number) => void;
};

function fmtTSI(iso: string) {
    return new Intl.DateTimeFormat("tr-TR", {
        timeZone: "Europe/Istanbul",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date(iso));
}

function statusOf(f: UcusPlani, refIso: string) {
    const ref = +new Date(refIso);
    const start = +new Date(f.startTimeUtc);
    const end = f.endTimeUtc ? +new Date(f.endTimeUtc) : Number.POSITIVE_INFINITY;
    if (ref < start) return "Planlandı";
    if (ref >= end && Number.isFinite(end)) return "Tamamlandı";
    return "Devam ediyor";
}

function inferIataLabel(f: UcusPlani, kind: "origin" | "dest") {
    const txt = (kind === "origin" ? f.origin : f.destination)?.trim();
    if (txt) return txt;
    const lat = kind === "origin" ? f.originLat : f.destinationLat;
    const lng = kind === "origin" ? f.originLng : f.destinationLng;
    if (typeof lat === "number" && typeof lng === "number") {
        return iataNearest(lat, lng)?.code ?? "—";
    }
    return "—";
}

export default function FlightListPanel({ open, onClose, flights, lastPositions, mode, refIso, onSelect }: Props) {
    // Hızlı tarih filtresi (TSİ): "Tümü" | "Bugün" | "±1g"
    const [range, setRange] = useState<"all" | "today" | "pm1">("today");
    const [q, setQ] = useState("");
    const [sortBy, setSortBy] = useState<"time" | "code" | "status">("time");

    // TSİ gün sınırlarını üret
    const tsiNow = new Date(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Istanbul" }).format(new Date(refIso)));
    function startOfDayTSI(d: Date) {
        const s = new Date(d); s.setHours(0, 0, 0, 0); return s;
    }
    const d0 = startOfDayTSI(tsiNow);               // bugün 00:00 TSİ
    const d1 = new Date(+d0 + 24 * 3600_000);       // yarın 00:00 TSİ
    const dm1 = new Date(+d0 - 24 * 3600_000);       // dün 00:00 TSİ
    const d2 = new Date(+d0 + 2 * 24 * 3600_000);  // yarından sonraki gün 00:00 TSİ

    // Yardımcı: ISO'yu TSİ milisaniyeye çevir
    const tsi = (iso: string) =>
        +new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));

    // Filtre + arama
    const view = useMemo(() => {
        const ref = +new Date(refIso);

        // Liste penceresi: range'e göre [winStart, winEnd)
        let winStart = dm1, winEnd = d2;          // default: ±1g (dün 00:00 → yarından sonraki gün 00:00)
        if (range === "today") { winStart = d0; winEnd = d1; }
        else if (range === "pm1") { winStart = dm1; winEnd = d2; }
        else if (range === "all") { winStart = new Date(0); winEnd = new Date(8640000000000000); }

        const filtered = flights.filter(f => {
            // Uçuş penceresi (TSİ)
            const startTSI = tsi(f.startTimeUtc);
            const endTSI = f.endTimeUtc ? tsi(f.endTimeUtc) : Number.POSITIVE_INFINITY;

            // Pencereyle ÖRTÜŞÜYOR MU?  (sadece start'a bakmak yerine overlap)
            const overlaps = !(endTSI <= +winStart || startTSI >= +winEnd);
            if (!overlaps) return false;

            // Arama (kod + IATA etiketleri)
            const o = inferIataLabel(f, "origin");
            const d = inferIataLabel(f, "dest");
            const hay = `${f.code} ${o} ${d}`.toLowerCase();
            if (q.trim() && !hay.includes(q.trim().toLowerCase())) return false;

            return true;
        });

        // Sıralama
        const sorted = filtered.slice().sort((a, b) => {
            if (sortBy === "code") return a.code.localeCompare(b.code);
            if (sortBy === "status") {
                const sa = statusOf(a, refIso), sb = statusOf(b, refIso);
                return sa.localeCompare(sb);
            }
            return +new Date(a.startTimeUtc) - +new Date(b.startTimeUtc); // time
        });

        return sorted.map(f => {
            const last = lastPositions[f.id] ?? null;
            const s = statusOf(f, refIso);
            return { f, last, status: s, originL: inferIataLabel(f, "origin"), destL: inferIataLabel(f, "dest") };
        });
    }, [flights, lastPositions, q, sortBy, range, refIso, d0, d1, dm1, d2]);

    const badgeColor = (s: string) => s === "Tamamlandı" ? "#10b981" : s === "Planlandı" ? "#94a3b8" : "#3b82f6";

    return (
        <>
            <div className={`drawerOverlay ${open ? "is-open" : ""}`} onClick={onClose} />
            <aside className={`drawerPanel ${open ? "is-open" : ""}`} style={{ width: "min(520px, 92vw)", zIndex: 705 }}>
                <div className="drawerHead">
                    <h3>Uçuş Listesi</h3>
                    <button className="iconBtn" onClick={onClose} aria-label="Kapat">✕</button>
                </div>

                <div className="drawerBody" style={{ gap: ".7rem" }}>
                    {/* Arama & filtre */}
                    <div className="group" style={{ display: "grid", gap: ".6rem" }}>
                        <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
                            <input
                                placeholder="Ara: THY203, IST, FRA…"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                style={{ flex: "1 1 220px" }}
                            />
                            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} title="Sırala">
                                <option value="time">Zamana göre</option>
                                <option value="code">Koda göre</option>
                                <option value="status">Duruma göre</option>
                            </select>
                        </div>

                        <div className="btnRow">
                            <button className={`btn ${range === "today" ? "btn--primary" : "btn--ghost"}`} onClick={() => setRange("today")}>Bugün</button>
                            <button className={`btn ${range === "pm1" ? "btn--primary" : "btn--ghost"}`} onClick={() => setRange("pm1")}>±1g</button>
                            <button className={`btn ${range === "all" ? "btn--primary" : "btn--ghost"}`} onClick={() => setRange("all")}>Tümü</button>
                            <span className="badge">Mod: {mode === "live" ? "Canlı" : "Replay"} · Ref: {fmtTSI(refIso)}</span>
                        </div>
                    </div>

                    {/* Liste */}
                    <div className="group" style={{ padding: 0 }}>
                        {view.length === 0 ? (
                            <div style={{ padding: "1rem" }}>Kayıt yok.</div>
                        ) : (
                            <div role="table" aria-label="Uçuş listesi">
                                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 120px 90px", gap: ".5rem", padding: ".6rem .8rem", opacity: .85, borderBottom: "1px solid rgba(255,255,255,.12)" }}>
                                    <div>Kod</div>
                                    <div>Kalkış</div>
                                    <div>Varış</div>
                                    <div>Başlangıç (TSİ)</div>
                                    <div>Durum</div>
                                </div>
                                <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                                    {view.map(({ f, status, originL, destL }) => (
                                        <button
                                            key={f.id}
                                            className="optionCard"
                                            style={{ width: "100%", borderRadius: 0, borderLeft: "0", borderRight: "0" }}
                                            onClick={() => { onSelect(f.id); onClose(); }}
                                        >
                                            <div style={{ width: 110, fontWeight: 800 }}>{f.code}</div>
                                            <div>{originL}</div>
                                            <div>{destL}</div>
                                            <div style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTSI(f.startTimeUtc)}</div>
                                            <div>
                                                <span className="badge" style={{ borderColor: "transparent", background: "transparent", color: badgeColor(status), fontWeight: 800 }}>
                                                    ● {status}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
}
