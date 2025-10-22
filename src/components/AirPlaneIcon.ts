import { DivIcon } from 'leaflet';
import { type Continent, type ThemeMode, colorFor } from '../lib/continents';

export function makePlaneIcon(
  heading: number,
  continent: Continent,
  theme: ThemeMode,
  size = 88, 
  strokeWidth = 8.8
) {
  const fill = colorFor(continent, theme);
  const half = size / 2;

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88"
       width="${size}" height="${size}"
       style="transform: rotate(${heading}deg); display:block">
    <g fill="${fill}" stroke="black" stroke-width="${strokeWidth}"
       stroke-linejoin="round" stroke-linecap="round">

      <!-- Kısaltılmış gövde -->
      <path d="M47.5 5
               Q51 13 53 24
               L55 36
               Q56 39 59 40
               L81 49
               Q83 50 81.5 51.5
               L59 55
               Q56 56 55 59
               L55 72
               Q55 74 57 76
               L62 81
               Q63 82 62 83.5
               L55 82
               Q54 82 53.5 83
               L50.5 92
               Q50 94 47.5 94
               Q45 94 44.5 92
               L41.5 83
               Q41 82 40 82
               L33 83.5
               Q32 82 33 81
               L38 76
               Q40 74 40 72
               L40 59
               Q39 56 36 55
               L13.5 51.5
               Q12 50 14 49
               L36 40
               Q39 39 40 36
               L42 24
               Q44 13 47.5 5 Z"/>

      <!-- Geriye süpürülmüş ana kanatlar -->
      <path d="M40 44 L12 56 L42 54 Z"/>
      <path d="M55 44 L83 56 L53 54 Z"/>

      <!-- Geriye bakan yatay stabilizer -->
      <path d="
        M41 74
        L29 82
        L43 86
        L47.5 81
        L52 86
        L66 82
        L54 74
        L47.5 76
        Z
      "/>

      <!-- Dikey kuyruk -->
      <path d="M46.5 67 L48.5 67 L50.5 72 L47.5 74 L44.5 72 Z"/>
    </g>
  </svg>`;

  return new DivIcon({
    className: 'plane-marker',
    html: svg,
    iconSize: [size, size],
    iconAnchor: [half, half],
  });
}

/* 
Kıtayı bul: Map, son konumdan [lat,lng] çıkarır ve flightContinentFrom(lat,lng) ile “Europe / Asia / …” hesaplar.

Rengi seç: Bu kıta ve tema bilgisi colorFor(continent, theme) fonksiyonuna verilir; tema “dark” ise koyu paletten, değilse açık paletten renk döner.

İkonu üret: makePlaneIcon(heading, continent, theme, size, strokeWidth) SVG üretir; fill olarak az önceki renk, transform: rotate(${heading}deg) ile yön kullanılır. Sonuç Leaflet.DivIcon olarak Marker’a takılır.

Map’te kullanım: Marker oluşturulurken makePlaneIcon(...) çağrılır; seçili uçuşsa boyut/dış hat kalınlığı biraz artırılır. */
