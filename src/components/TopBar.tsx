import { useState } from "react";
import type { Continent, ThemeMode } from "../lib/continents"; //Kıta checkboxları
import { colorFor } from "../lib/continents"; //seçili tema+ kıtaya göre boyamak

type Props = {
  fromUtc: string; setFromUtc: (v: string) => void;
  toUtc: string; setToUtc: (v: string) => void;
  listOpen?: boolean; setListOpen?: (v: boolean) => void;

  // temel kontrol
  refreshSec: number; setRefreshSec: (v: number) => void;  //yenileme
  tracking: boolean;  //başlat durdur butonları bunlara bakıyor
  onStart: () => void;
  onStop: () => void;

  onLoadAll?: () => void;
  // kıta filtresi
  enabledContinents: Set<Continent>;
  onToggleContinent: (c: Continent) => void;

  mode: 'live' | 'replay';
  setMode: (m: 'live' | 'replay') => void;
  // isteğe bağlı planlama formu (çekmecede gösterilir)
  planner?: React.ReactNode;

  // tema & harita stili (kontrolleri burada: harita stili var, temayı dışarıdan da değiştirebilirsin)
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;

  mapStyle: "osmLight" | "darkSoft" | "dark" | "satellite";  //harita seçme
  setMapStyle: (s: "osmLight" | "darkSoft" | "dark" | "satellite") => void;

  // çekmeceler opsiyonel üst bileşeni yönetmek içişn 
  filterOpen?: boolean; setFilterOpen?: (v: boolean) => void;
  plannerOpen?: boolean; setPlannerOpen?: (v: boolean) => void;

  // Kart başlığı vs. için opsiyoneller:
  selectedId?: number | null;
  selectedCode?: string;
};

//Checbox yanında görünen etiketler
const continentLabels: Record<Continent, string> = {
  Europe: "Avrupa", Asia: "Asya", NorthAmerica: "Kuzey Amerika",
  SouthAmerica: "Güney Amerika", Africa: "Afrika", Oceania: "Okyanusya",
  Antarctica: "Antarktika", Other: "Diğer",
};

export default function TopBar(p: Props) {
  // kontrollü değilse internal state kullan Topbarı hem tek başına hem de üstten yönetmeyi sağşar ???????? KONTROL ET BURAYI 
  const [internalFilterOpen, _setInternalFilterOpen] = useState(false);
  const filterOpen = p.filterOpen ?? internalFilterOpen;
  const setFilterOpen = p.setFilterOpen ?? _setInternalFilterOpen;

  const [internalPlannerOpen, _setInternalPlannerOpen] = useState(false);
  const plannerOpen = p.plannerOpen ?? internalPlannerOpen;
  const setPlannerOpen = p.setPlannerOpen ?? _setInternalPlannerOpen;
  const [internalListOpen, _setInternalListOpen] = useState(false);
  const listOpen = p.listOpen ?? internalListOpen;
  const setListOpen = p.setListOpen ?? _setInternalListOpen

  const anyOpen = filterOpen || plannerOpen || listOpen;
  const closeAll = () => { setFilterOpen(false); setPlannerOpen(false); setListOpen(false); };


  return (
    <>
      <header className="topbar topbar--compact">
        <div className="topbar__row">
          <div className="topbar__left">
            {p.planner && (
              <button
                type="button"
                className="btn"
                onClick={() => { setPlannerOpen(true); setFilterOpen(false); }}
              >
                Yeni Plan
              </button>
            )}

            {!p.tracking ? (
              <button type="button" className="btn btn--primary" onClick={p.onStart}>
                Takibi Başlat
              </button>
            ) : (
              <button type="button" className="btn btn--danger" onClick={p.onStop}>
                Durdur
              </button>
            )}

            <label className="topbar__selectWrap">
              <span>Yenileme</span>
              <select
                value={p.refreshSec}
                onChange={(e) => p.setRefreshSec(Number(e.target.value))}
              >
                {[2, 3, 5, 10, 15, 30].map(s => (
                  <option key={s} value={s}>{s} sn</option>
                ))}
              </select>
            </label>
          </div>
          
          <div className="topbar__right">
            <button
              type="button"
              className="btn"
              onClick={() => { setListOpen(true); setPlannerOpen(false); setFilterOpen(false); }}
            >
              Uçuş Listesi
            </button>

            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => { setFilterOpen(!filterOpen); setPlannerOpen(false); setListOpen(false); }}
            >
              Filtreler
            </button>
          </div>
        </div>
      </header>

      {/* çekmece arkaplanı */}
      <div className={`drawerOverlay ${anyOpen ? "is-open" : ""}`} onClick={closeAll} />

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

            {/* Harita Stili */}
            <div className="field">
              <span>Harita Stili</span>
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
                      <span
                        className="optionThumb__img"
                        style={{ backgroundImage: `url(${s.thumb})` }}
                      />
                      <span className="optionThumb__label">{s.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* (2) Kıtalar */}
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
                    <span
                      style={{
                        width: 14, height: 4,
                        background: colorFor(c, p.theme),
                        display: "inline-block", borderRadius: 2
                      }}
                    />
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
              >
                Hepsi
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  (Object.keys(continentLabels) as Continent[]).forEach((c) => {
                    if (p.enabledContinents.has(c)) p.onToggleContinent(c);
                  });
                }}
              >
                Temizle
              </button>
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
    </>
  );
}
