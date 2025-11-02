import React, { useMemo } from "react";
import "../styles/topbar.css"
type Props = {
    playing: boolean;
    onPlay: () => void;
    onPause: () => void;
    // zaman aralığı (UTC ISO string veya epoch ms — ikisi de olur; burada number kullandım)
    rangeStartMs: number;
    rangeEndMs: number;
    cursorMs: number;                 // sürgünün gösterdiği an
    onScrub: (ms: number) => void;    // sürgüyü hareket ettirme
    speed: number;                    // 0.25, 0.5, 1, 2, 4, 8...
    onChangeSpeed: (s: number) => void;
    onJumpNow: () => void;            // “Şimdi (Canlı)”
    isLiveNow: boolean;               // now aralık içindeyse true
    // Ayrıntılar (From/To + Aralığı Yükle)
    detailsOpen: boolean;
    onToggleDetails: () => void;
    onChangeRange?: (startMs: number, endMs: number) => void;
    onLoadRange?: () => void;         // “Aralığı Yükle”
};

function fmt(ms: number) {
    const d = new Date(ms);
    // 05.11 01:10 gibi kısa
    return d.toLocaleString(undefined, {
        day: "2-digit", month: "2-digit",
        hour: "2-digit", minute: "2-digit"
    });
}

export default function TimelineBar({
    playing, onPlay, onPause,
    rangeStartMs, rangeEndMs, cursorMs, onScrub,
    speed, onChangeSpeed, onJumpNow, isLiveNow,
    detailsOpen, onToggleDetails, onChangeRange, onLoadRange
}: Props) {

    const clamped = useMemo(() => {
        const min = Math.min(rangeStartMs, rangeEndMs);
        const max = Math.max(rangeStartMs, rangeEndMs);
        const v = Math.min(Math.max(cursorMs, min), max);
        const pct = ((v - min) / (max - min)) * 100 || 0;
        return { min, max, v, pct };
    }, [rangeStartMs, rangeEndMs, cursorMs]);

    return (
        <div className={`tlWrap ${detailsOpen ? "tlWrap--open" : ""}`}>
            {/* Compact bar */}
            <div className="tlBar" role="toolbar" aria-label="Zaman Çizgisi">
                <button
                    className="tlBtn tlBtn--primary"
                    onClick={playing ? onPause : onPlay}
                    aria-label={playing ? "Duraklat" : "Oynat"}
                    title={playing ? "Duraklat" : "Oynat"}
                >
                    {playing ? (
                        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M8 5v14l11-7-11-7z" fill="currentColor" /></svg>
                    )}
                </button>
                <div className="tlRange">
                    <span className="tlEdge">{fmt(clamped.min)}</span>

                    <div
                        className="tlTrackWrap"
                        style={{ ['--pct' as any]: clamped.pct / 100 }} // 0..1
                    >
                        <input
                            className="tlSlider"
                            type="range"
                            min={clamped.min}
                            max={clamped.max}
                            value={clamped.v}
                            onChange={(e) => onScrub(Number(e.target.value))}
                        />

                        {/* balon + ince çizgi */}
                        <div className="tlNow" aria-live="polite">
                            <span className="tlNow__label">{fmt(cursorMs)}</span>
                            <span className="tlNow__tick" />
                        </div>
                    </div>

                    <span className="tlEdge">{fmt(clamped.max)}</span>
                </div>


                <div className="tlRight">
                    <select
                        className="tlSelect"
                        value={String(speed)}
                        onChange={(e) => onChangeSpeed(Number(e.target.value))}
                        title="Oynatma Hızı"
                        aria-label="Oynatma Hızı"
                    >
                        {[0.5, 1, 2, 4].map(s => (
                            <option key={s} value={s}>{s}x</option>
                        ))}
                    </select>

                    <button className={`tlPill ${isLiveNow ? "is-live" : ""}`} onClick={onJumpNow}>
                        Şimdi (Canlı)
                    </button>

                    <button className="tlBtn" onClick={onToggleDetails} aria-expanded={detailsOpen}>
                        <svg width="18" height="18" viewBox="0 0 24 4">
                            <path d="M12 7l6 6H6l6-6z" fill="currentColor" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Details drawer */}
            {detailsOpen && (
                <div className="tlDetails">
                    <div className="tlFields">
                        <label>
                            From (TSİ)
                            <input
                                type="datetime-local"
                                onChange={(e) => {
                                    if (!onChangeRange) return;
                                    const st = new Date(e.target.value).getTime();
                                    onChangeRange(st, rangeEndMs);
                                }}
                            />
                        </label>
                        <label>
                            To (TSİ)
                            <input
                                type="datetime-local"
                                onChange={(e) => {
                                    if (!onChangeRange) return;
                                    const en = new Date(e.target.value).getTime();
                                    onChangeRange(rangeStartMs, en);
                                }}
                            />
                        </label>
                        <button className="tlPill" onClick={onLoadRange}>Aralığı Yükle (Tümü)</button>
                    </div>
                </div>
            )}
        </div>
    );
}
