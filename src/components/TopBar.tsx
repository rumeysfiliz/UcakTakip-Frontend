import { useState } from "react";
import type { Continent, ThemeMode } from "../lib/continents";
import { colorFor } from "../lib/continents";

type Props = {
  fromUtc: string; setFromUtc: (v: string) => void;
  toUtc: string; setToUtc: (v: string) => void;

  // takip/polling
  refreshSec: number; setRefreshSec: (v: number) => void;
  tracking: boolean;
  onStart: () => void;
  onStop: () => void;

  onLoadAll?: () => void;

  // kıta filtresi
  enabledContinents: Set<Continent>;
  onToggleContinent: (c: Continent) => void;

  // mod
  mode: 'live' | 'replay';
  setMode: (m: 'live' | 'replay') => void;

  // planner formu (çekmece içine gömüyoruz)
  planner?: React.ReactNode;

  // tema & harita
  theme: ThemeMode; setTheme: (t: ThemeMode) => void;
  mapStyle: "osmLight" | "darkSoft" | "dark" | "satellite"; setMapStyle: (s: "osmLight" | "darkSoft" | "dark" | "satellite") => void;

  // çekmeceler — Dashboard yönetebilsin diye opsiyonel kontrollü
  filterOpen?: boolean; setFilterOpen?: (v: boolean) => void;
  plannerOpen?: boolean; setPlannerOpen?: (v: boolean) => void;
  listOpen?: boolean; setListOpen?: (v: boolean) => void;

  // kart başlığı için
  selectedId?: number | null;
  selectedCode?: string;
};

const continentLabels: Record<Continent, string> = {
  Europe: "Avrupa", Asia: "Asya", NorthAmerica: "Kuzey Amerika",
  SouthAmerica: "Güney Amerika", Africa: "Afrika", Oceania: "Okyanusya",
  Antarctica: "Antarktika", Other: "Diğer",
};

function DockButton({
  label, onClick, disabled, title, children
}: React.PropsWithChildren<{
  label: string; onClick: () => void; disabled?: boolean; title?: string; 
}>) {
  return (
    <button
      className={`dockBtn${disabled ? " is-disabled" : ""}`}
      onClick={disabled ? undefined : onClick}
      title={title ?? label}
      aria-label={label}
      type="button"
      
    >
      <span className="dockIcon" aria-hidden>{children}</span>
      <span className="dockLabel">{label}</span>
    </button>
  );
}

export default function TopBar(p: Props) {
  // kontrollü değilse local state
  const [internalFilterOpen, _setInternalFilterOpen] = useState(false);
  const filterOpen = p.filterOpen ?? internalFilterOpen;
  const setFilterOpen = p.setFilterOpen ?? _setInternalFilterOpen;

  const [internalPlannerOpen, _setInternalPlannerOpen] = useState(false);
  const plannerOpen = p.plannerOpen ?? internalPlannerOpen;
  const setPlannerOpen = p.setPlannerOpen ?? _setInternalPlannerOpen;

  const [internalListOpen, _setInternalListOpen] = useState(false);
  const listOpen = p.listOpen ?? internalListOpen;
  const setListOpen = p.setListOpen ?? _setInternalListOpen;

  const anyOpen = filterOpen || plannerOpen || listOpen;
  const onlyListOpen = listOpen && !filterOpen && !plannerOpen;
  const closeAll = () => { setFilterOpen(false); setPlannerOpen(false); setListOpen(false); };

  return (
    <>
      {/* === ÜST DOCK (BottomDock’un üstteki kardeşi) === */}
      <nav className="topDock" role="toolbar" aria-label="Üst araç çubuğu">
        {/* Takip başlat/durdur */}
        <DockButton
          label={p.tracking ? "DURDUR" : "BAŞLAT"}
          onClick={p.tracking ? p.onStop : p.onStart}
          title={p.tracking ? "Takibi Durdur" : "Takibi Başlat"}
        >
          {p.tracking ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M7 5h4v14H7zM13 5h4v14h-4z" stroke="currentColor" strokeWidth="2" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7-11-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
        </DockButton>

        {/* Yenileme seçimi */}
        <div className="dockBtn" title="Yenileme Hızı">
          <span className="dockIcon" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 10-3.4 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M21 3v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <select
            value={p.refreshSec}
            onChange={(e) => p.setRefreshSec(Number(e.target.value))}
            aria-label="Yenileme Sıklığı"
            className="tlSelect"
            style={{ height: 28 }}
          >
            {[2, 3, 5, 10, 15, 30].map(s => <option key={s} value={s}>{s}s</option>)}
          </select>
        </div>




      </nav>

      {/* çekmece arkaplanı */}
      {onlyListOpen ? (
        // Yalnızca uçuş listesi açıkken: pass-through, kararma yok, tıklama engellemez
        <div className={`drawerOverlay drawerOverlay--pass ${listOpen ? "is-open" : ""}`} />
      ) : (
        // Diğer durumlarda (filtre/planner): klasik overlay, tıklayınca hepsini kapat
        <div className={`drawerOverlay ${anyOpen ? "is-open" : ""}`} onClick={closeAll} />
      )}
      {/* === FİLTRE ÇEKMECESİ === */}
      <aside className={`drawerPanel ${filterOpen ? "is-open" : ""}`} aria-hidden={!filterOpen}>
        <div className="drawerHead">
          <h3>Filtreler</h3>
          <button type="button" className="iconBtn" onClick={() => setFilterOpen(false)} aria-label="Kapat">✕</button>
        </div>

        <div className="drawerBody">
          {/* Genel Ayarlar */}
          <div className="group">
            <div className="groupTitle">Genel Ayarlar</div>
            <div className="optionGrid optionGrid--tight">
              {([
                { key: "osmLight", title: "Açık", thumb: "https://a.tile.openstreetmap.org/5/17/11.png" },
                { key: "darkSoft", title: "Koyu", thumb: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/5/17/11.png" },
                { key: "dark", title: "Tam Koyu", thumb: "https://a.basemaps.cartocdn.com/dark_all/5/17/11.png" },
                { key: "satellite", title: "Uydu", thumb: "https://tiles.stadiamaps.com/tiles/alidade_satellite/5/17/11.jpg" },
              ] as const).map(s => {
                const active = p.mapStyle === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`optionThumb ${active ? "is-active" : ""}`}
                    onClick={() => p.setMapStyle(s.key as typeof p.mapStyle)}
                    title={s.title}
                    aria-pressed={active}
                  >
                    <span className="optionThumb__img" style={{ backgroundImage: `url(${s.thumb})` }} />
                    <span className="optionThumb__label">{s.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kıtalar */}
          <div className="group">
            <div className="groupTitle">Kıtalar</div>
            <div style={{ display: "grid", gap: ".2rem", gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              {(Object.keys(continentLabels) as Continent[]).map((c) => {
                const checked = p.enabledContinents.has(c);
                return (
                  <label
                    key={c}
                    className="field"
                    style={{ flexDirection: "row", alignItems: "center", gap: ".5rem", margin: 0 }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => p.onToggleContinent(c)} />
                    <span style={{ width: 14, height: 4, background: colorFor(c, p.theme), display: "inline-block", borderRadius: 2 }} />
                    <span>{continentLabels[c]}</span>
                  </label>
                );
              })}
            </div>

            <div className="btnRow" style={{ marginTop: ".4rem", justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  (Object.keys(continentLabels) as Continent[]).forEach((c) => {
                    if (!p.enabledContinents.has(c)) p.onToggleContinent(c);
                  });
                }}
              >Hepsi</button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  (Object.keys(continentLabels) as Continent[]).forEach((c) => {
                    if (p.enabledContinents.has(c)) p.onToggleContinent(c);
                  });
                }}
              >Temizle</button>
            </div>
          </div>
        </div>
      </aside>

      {/* === PLANLAMA ÇEKMECESİ === */}
      <aside
        className={`drawerPanel ${plannerOpen ? "is-open" : ""}`}
        aria-hidden={!plannerOpen}
        style={{ zIndex: 701, width: "min(460px, 92vw)" }}
      >
        <div className="drawerHead">
          <h3>Yeni Uçuş Planı</h3>
          <button type="button" className="iconBtn" onClick={() => setPlannerOpen(false)} aria-label="Kapat">✕</button>
        </div>
        <div className="drawerBody">
          {p.planner ?? <div style={{ opacity: .85 }}>Form bulunamadı.</div>}
        </div>
      </aside>

      {/* === LİSTE ÇEKMECESİ Dashboard tarafında açılıyor === */}
    </>
  );
}
