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
    closeOnOutsideClick?: boolean;
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
    const [range, setRange] = useState<"today" | "three" | "week" | "month" | "all">("today");
    const [q, setQ] = useState("");
    const [sortBy, setSortBy] = useState<"time" | "code" | "status">("time");
    // SIRALAMAAAAAA

    type SortKey =
        | "time-asc" | "time-desc"
        | "code-asc" | "code-desc"
        | "status-asc" | "status-desc";

    const [sortKey, setSortKey] = useState<SortKey>("time-asc");


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


        // Liste penceresi: range'e göre [winStart, winEnd)
        let winStart = dm1, winEnd = d2; // default
        if (range === "today") { winStart = d0; winEnd = d1; }
        else if (range === "three") { winStart = new Date(+d0 - 24 * 3600_000); winEnd = new Date(+d0 + 2 * 24 * 3600_000); } // 3 gün (dün–yarın)
        else if (range === "week") { winStart = new Date(+d0 - 3 * 24 * 3600_000); winEnd = new Date(+d0 + 4 * 24 * 3600_000); } // 7 gün
        else if (range === "month") { winStart = new Date(+d0 - 15 * 24 * 3600_000); winEnd = new Date(+d0 + 16 * 24 * 3600_000); } // ~1 ay
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
            // alan & yön
            const [field, dir] = sortKey.split("-") as ["time" | "code" | "status", "asc" | "desc"];
            let cmp = 0;
            const STATUS_RANK_ASC = { "Planlandı": 0, "Devam ediyor": 1, "Tamamlandı": 2 } as const;

            if (field === "time") {
                cmp = (+new Date(a.startTimeUtc)) - (+new Date(b.startTimeUtc));
            } else if (field === "code") {
                cmp = a.code.localeCompare(b.code, "tr", { numeric: true, sensitivity: "base" });
            } else { // "status"
                const sa = statusOf(a, refIso);
                const sb = statusOf(b, refIso);
                cmp = (STATUS_RANK_ASC as any)[sa] - (STATUS_RANK_ASC as any)[sb]; // artan: Planlandı→Devam ediyor→Tamamlandı
            }

            if (cmp === 0) {
                // tie-break: kod
                cmp = a.code.localeCompare(b.code, "tr", { numeric: true, sensitivity: "base" });
            }
            return dir === "asc" ? cmp : -cmp;
        });

        return sorted.map(f => {
            const last = lastPositions[f.id] ?? null;
            const s = statusOf(f, refIso);
            return { f, last, status: s, originL: inferIataLabel(f, "origin"), destL: inferIataLabel(f, "dest") };
        });
    }, [flights, lastPositions, q, sortBy, range, refIso, d0, d1, dm1, d2]);


    return (
        <>
            <div
                className="flightTableHead"
                style={{
                    display: "grid",
                    gridTemplateColumns: "110px 1fr 1fr 120px 90px",
                    gap: ".5rem",
                    padding: ".6rem .8rem",
                    opacity: .85,
                    borderBottom: "1px solid rgba(255,255,255,.12)"
                }}
            ></div>
            <div className={`drawerOverlay drawerOverlay--pass ${open ? "is-open" : ""}`} />
            <aside
                className={`drawerPanel drawerPanel--left drawerPanel--list ${open ? "is-open" : ""}`} style={{ width: "min(460px, 92vw)", zIndex: 705 }}
            >                <div className="drawerHead">
                    <h3>Uçuş Listesi</h3>
                    <button className="iconBtn" onClick={onClose} aria-label="Kapat">✕</button>
                </div>

                <div className="drawerBody" style={{ gap: ".7rem" }}>
                    {/* Arama & filtre */}
                    <div className="group" style={{ display: "grid", gap: ".6rem" }}>
                        {/* 1. satır: Arama + Tek dropdown */}
                        <div className="searchBar">
                            <svg className="searchIcon" width="16" height="16" viewBox="0 0 24 24">
                                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none" />
                                <line x1="16" y1="16" x2="22" y2="22" stroke="currentColor" strokeWidth="2" />
                            </svg>

                            <input
                                className="searchInput"
                                placeholder="Ara: THY203, IST, FRA…"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                type="text"
                            />
                            <select
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value as SortKey)}
                                title="Sıralama"
                            >
                                <option value="time-asc">Zaman ↑</option>
                                <option value="time-desc">Zaman ↓</option>
                                <option value="code-asc">Kod ↑</option>
                                <option value="code-desc">Kod ↓</option>
                                <option value="status-asc">Durum ↑</option>
                                <option value="status-desc">Durum ↓</option>
                            </select>
                        </div>



                        {/* 2. satır: Tarih sekmeleri (segmented control) */}
                        <div className="seg">
                            <button className={`seg__btn ${range === "today" ? "is-active" : ""}`} onClick={() => setRange("today")}>Bugün</button>
                            <button className={`seg__btn ${range === "three" ? "is-active" : ""}`} onClick={() => setRange("three")}>3 Günlük</button>
                            <button className={`seg__btn ${range === "week" ? "is-active" : ""}`} onClick={() => setRange("week")}>1 Haftalık</button>
                            <button className={`seg__btn ${range === "month" ? "is-active" : ""}`} onClick={() => setRange("month")}>1 Aylık</button>
                            <button className={`seg__btn ${range === "all" ? "is-active" : ""}`} onClick={() => setRange("all")}>Tümü</button>
                        </div>

                    </div>

                    {/* Liste */}
                    <div className="flightListWrap">
                        <div className="flightListToolbar">
                            <span className="toolbarLabel">Uçuşlar</span>
                            <span className="toolbarMeta">Mod: {mode === "live" ? "Canlı" : "Replay"} · Ref: {fmtTSI(refIso)}</span>
                        </div>

                        {view.length === 0 ? (
                            <div className="emptyState">
                                <div className="emptyIcon">🛫</div>
                                <div className="emptyText">Bu aralıkta uçuş yok</div>
                            </div>
                        ) : (
                            <ul className="flightList">
                                {view.map(({ f, status, originL, destL }) => (
                                    <li key={f.id}>
                                        <button
                                            className={`flightItem flightItem--${status.replace(" ", "_")}`}
                                            onClick={() => { onSelect(f.id); /* liste açık kalsın */ }}
                                        >
                                            {/* sol: kod */}
                                            <div className="fiLeft">
                                                <div className="fiCode">{f.code}</div>
                                                <div className="fiTime">{fmtTSI(f.startTimeUtc)} TSİ</div>
                                            </div>

                                            {/* orta: rota */}
                                            <div className="fiCenter" aria-label={`${originL} → ${destL}`}>
                                                <span className="iata">{originL}</span>
                                                <span className="arrow" aria-hidden>→</span>
                                                <span className="iata">{destL}</span>
                                            </div>

                                            {/* sağ: durum rozet */}
                                            <div className="fiRight">
                                                <span className={`fiBadge fiBadge--${status.replace(" ", "_")}`}>{status}</span>
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>


                </div>
            </aside>
        </>
    );
}
