import React from "react";

type Props = {
  onOpenList: () => void;
  onOpenFilters: () => void;         // Harita seçenekleri de burada
  onOpenPlanner: () => void;        // istersen “Yeni Plan” ikonunu da açar
  onToggleTimeline: () => void;      // Playback panelini aç/kapa
  timelineOpen: boolean;
  
};

function DockButton({
  label, onClick, disabled, title, children,
}: React.PropsWithChildren<{
  label: string; onClick: () => void; disabled?: boolean; title?: string; className?: string;
}>) {
  return (
    <button
      className={`dockBtn${disabled ? " is-disabled" : ""}`}
      onClick={disabled ? undefined : onClick}
      title={title ?? label}
      aria-label={label}
      
    >
      <span className="dockIcon" aria-hidden>{children}</span>
      <span className="dockLabel">{label}</span>
    </button>
  );
}

export default function BottomDock({
  onOpenList, onOpenFilters, onOpenPlanner, onToggleTimeline, timelineOpen
}: Props) {
  return (
    <nav className="bottomDock" role="toolbar" aria-label="Alt araç çubuğu">

      {/* Filtreler (içinde harita seçenekleri de var) */}
      <DockButton label="FİLTRELER" onClick={onOpenFilters}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
      </DockButton>


      {/* Uçuş Listesi */}
      <DockButton label="UÇUŞ LİSTESİ" onClick={onOpenList}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
      </DockButton>

      {/* Playback (Zaman Çizgisi) */}
      <DockButton label="GERİ OYNATIM" onClick={onToggleTimeline} title="Zaman Çizgisi">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" fill={timelineOpen ? "currentColor" : "none"} opacity={timelineOpen ? .18 : 1}/>
        </svg>
      </DockButton>

      {/* Sağ: Yeni Plan (New Plan) */}
<div className="dockGroup">
   <DockButton
     label="YENİ PLAN"
     onClick={onOpenPlanner}
     className="topBtn topBtn--primary"  // ← TopBar’daki stil
     aria-label="Yeni Uçuş Planı"
     title="Yeni Uçuş Planı"
   >
     <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
       <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
     </svg>
   </DockButton>
 </div>
    </nav>
  );
}
