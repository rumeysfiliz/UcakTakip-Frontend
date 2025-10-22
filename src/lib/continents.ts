export type Continent =
  | "Europe" | "Asia" | "NorthAmerica" | "SouthAmerica"
  | "Africa" | "Oceania" | "Antarctica" | "Other";

export type ThemeMode = 'light' | 'darkSoft' | 'dark';

/* Uçağın son konumuna göre hangi kıtada olduğunu sınırlarla hesaplıyor ve kıtalara göre tema uyumu sağlıyoor.
Uçak ikonları (AirPlaneIcon), rota rengi (Map), ayrıca TopBar kıta anahtarı renk göstergesi */

// — Paletler —
const PALET_LIGHT: Record<Continent, string> = {
  Europe: "#4F46E5",
  Asia: "#36ca87ff",
  NorthAmerica: "#e3be7d",
  SouthAmerica: "#fa7e7e",
  Africa: "#ff5106",
  Oceania: "#3bb5f6ff",
  Antarctica: "#94A3B8",
  Other: "#6B7280",
};

const PALET_DARK: Record<Continent, string> = {
  Europe: "#524cf4ff",
  Asia: "#87efc9ff",
  NorthAmerica: "#fece86ff",
  SouthAmerica: "#ff9aa2",
  Africa: "#f8926dff",
  Oceania: "#09e8f4ff",
  Antarctica: "#cbd5e1",
  Other: "#e5e7eb",
};

// darkSoft’u dark’tan biraz daha yumuşak yapabilirsin sonra bir bak
const PALET_DARK_SOFT: Record<Continent, string> = {
  ...PALET_DARK,
};

// — Renk seçici —
export function colorFor(continent: Continent, theme: ThemeMode) {
  switch (theme) {
    case 'dark':     return PALET_DARK[continent];
    case 'darkSoft': return PALET_DARK_SOFT[continent];
    default:         return PALET_LIGHT[continent];
  }
}

// Dünya geneli için pratik/kabaca bölgeler
export function latLngToContinent(lat: number, lng: number): Continent {
  const lon = ((lng + 180) % 360) - 180;

  if (lat <= -60) return "Antarctica";
  if (lat >= 7 && lat <= 85 && lon >= -170 && lon <= -30) return "NorthAmerica";
  if (lat >= -56 && lat < 13 && lon >= -82 && lon <= -34) return "SouthAmerica";
  if (lat >= 35 && lat <= 72 && lon >= -25 && lon <= 45) return "Europe";
  if (lat >= -35 && lat <= 38 && lon >= -20 && lon <= 55) return "Africa";
  if (lat >= 20 && lat <= 45 && lon >= 35 && lon <= 65) return "Asia";
  if (lat >= 0 && lat <= 80 && lon >= 45 && lon <= 180) return "Asia";
  if (lat >= -10 && lat < 0 && lon >= 95 && lon <= 180) return "Asia";
  if (lat >= -50 && lat <= 0 && lon >= 110 && lon <= 180) return "Oceania";
  if (lat >= -50 && lat <= -10 && lon >= 140 && lon <= 180) return "Oceania";
  if (lat >= -47 && lat <= -33 && lon >= 165 && lon <= 180) return "Oceania";

  return "Other";
}

//Uçağın eenlem ve boylam koordinatlarından hangi kıtada olduğunu bulmak için burayı kullanıyoruz. Dasboard ve AirPlaneIcon da kullanıyoruz bunu
export function flightContinentFrom(lat?: number, lng?: number): Continent {
  if (typeof lat === "number" && typeof lng === "number") {
    return latLngToContinent(lat, lng);  //Esas işi bu yapıyuo
  }
  return "Other";
}

