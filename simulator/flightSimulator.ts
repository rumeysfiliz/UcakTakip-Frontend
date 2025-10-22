// simulator/flightSimulator.ts
// ✅ Geliştirmede self-signed HTTPS sertifikayı kabul et
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import axios from "axios";

/* =========================
   AYARLAR
   ========================= */
const API_BASE = "https://localhost:7229";
const API_KEY  = "Deneme-123";

// Makul sınırlar (sunucuyu ve DB’yi yormaz)
const FLIGHT_COUNT = 200;     // İşlenecek plan sayısı (listenin başından)
const STEP_SECONDS = 60;      // Noktalar arası zaman (sn)
const MAX_POINTS   = 5000;    // Bir uçuş için en fazla nokta

// İlk seed’de eski konumları silmek istersen bir kez true yap → çalıştır → tekrar false.
const PURGE_BEFORE_SEED = false;

/* =========================
   Havalimanları (lat,lng)
   ========================= */
const airports: Record<string, [number, number]> = {
  // 🇹🇷
  IST:[41.275,28.751], SAW:[40.898,29.309], ESB:[40.124,32.995],
  ADB:[38.292,27.157], AYT:[36.898,30.800], ADA:[37.002,35.297],
  ERZ:[39.956,41.170], VAN:[38.469,43.333], DIY:[37.894,40.201],
  TZX:[40.995,39.789],
  // 🇪🇺
  AMS:[52.308,4.764],  BER:[52.366,13.503], FRA:[50.037,8.562],
  CDG:[49.009,2.547],  LHR:[51.470,-0.454], LGW:[51.156,-0.182],
  FCO:[41.799,12.246], MXP:[45.630,8.720], ATH:[37.936,23.944],
  ZRH:[47.458,8.548],  BCN:[41.297,2.078],  MAD:[40.472,-3.561],
  LIS:[38.774,-9.134], BRU:[50.901,4.484],  VIE:[48.110,16.570],
  PRG:[50.100,14.260], BUD:[47.430,19.260], WAW:[52.165,20.967],
  OSL:[60.197,11.100], CPH:[55.618,12.656], HEL:[60.317,24.963],
  DUB:[53.427,-6.243], ARN:[59.650,17.930],
  // 🇺🇸
  JFK:[40.641,-73.778], LAX:[33.9416,-118.4085], ORD:[41.974,-87.907],
  ATL:[33.6407,-84.4277], DFW:[32.8998,-97.0403], MIA:[25.795,-80.29],
  YYZ:[43.677,-79.624],  YVR:[49.194,-123.183],   MEX:[19.436,-99.072],
  // 🇸🇦
  DXB:[25.253,55.365], DOH:[25.274,51.608], RUH:[24.957,46.698],
  JED:[21.670,39.157], CAI:[30.121,31.405], AMM:[31.723,35.993],
  TLV:[32.009,34.885], BEY:[33.8209,35.4884],
  // 🇮🇳 & Asya
  DEL:[28.556,77.100], BOM:[19.089,72.865], SIN:[1.364,103.991],
  KUL:[2.7456,101.709], BKK:[13.692,100.750], HKG:[22.308,113.918],
  ICN:[37.460,126.440], NRT:[35.773,140.392], HND:[35.552,139.779],
  PEK:[40.079,116.603], PVG:[31.144,121.808], TPE:[25.079,121.232],
  // 🇦🇺
  SYD:[-33.939,151.175], MEL:[-37.673,144.843], AKL:[-37.008,174.785],
  // 🇧🇷
  GRU:[-23.434,-46.475], EZE:[-34.822,-58.535], SCL:[-33.392,-70.785],
  LIM:[-12.022,-77.114], BOG:[4.701,-74.146],  CCS:[10.603,-66.991],
  // 🌍
  CPT:[-33.969,18.597], JNB:[-26.136,28.242], ADD:[8.977,38.799],
  NBO:[-1.319,36.927],  CMN:[33.367,-7.590],  LOS:[6.577,3.321],
  ACC:[5.605,-0.168],   DAR:[-6.878,39.202], MRU:[-20.430,57.683]
};

/* =========================
   Helpers & API
   ========================= */
function hasAirport(code?: string) {
  return !!code && Object.prototype.hasOwnProperty.call(airports, code);
}

const api = axios.create({
  baseURL: API_BASE,
  headers: { "x-api-key": API_KEY }
});

type Plan = {
  id: number; code: string; origin: string; destination: string;
  startTimeUtc?: string | null; endTimeUtc?: string | null;
};

async function fetchPlans(): Promise<Plan[]> {
  const { data } = await api.get<Plan[]>("/api/UcusPlani?includePositions=false");
  return data;
}

async function purgePositions(ucusPlaniId: number) {
  const { data } = await api.delete<{ deleted: number }>(`/api/UcakKonumu/plan/${ucusPlaniId}`);
  return data?.deleted ?? 0;
}

// Büyük rotaları parça parça gönder (sunucu rahatlasın)
async function postInChunks(route: any[], chunkSize = 500) {
  for (let i = 0; i < route.length; i += chunkSize) {
    const part = route.slice(i, i + chunkSize);
    await api.post("/api/UcakKonumu/toplu", part);
    await new Promise(r => setTimeout(r, 10));
  }
}

/* =========================
   Coğrafi yardımcılar
   ========================= */
function bearingDeg(a: [number, number], b: [number, number]) {
  const toRad = (d:number)=> d*Math.PI/180;
  const toDeg = (r:number)=> r*180/Math.PI;
  const [lat1, lon1] = [toRad(a[0]), toRad(a[1])];
  const [lat2, lon2] = [toRad(b[0]), toRad(b[1])];
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(lon2 - lon1);
  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/* =========================
   Rota üretimi (start → end)
   - İlk timestamp = start (tam)
   - Son timestamp = end   (tam)
   - Heading: ardışık noktalardan hesaplanır (random DEĞİL)
   ========================= */
function generateHistoricalRoute(plan: Plan, originCode: string, destCode: string) {
  const from = airports[originCode];
  const to   = airports[destCode];
  if (!from || !to) throw new Error(`Havalimanı bulunamadı: ${originCode} veya ${destCode}`);

  // Varsayılan süre 3 saat (plan’da yoksa)
  const start = plan.startTimeUtc ? new Date(plan.startTimeUtc) : new Date(Date.now() - 3 * 3600_000);
  const end   = plan.endTimeUtc   ? new Date(plan.endTimeUtc)   : new Date(start.getTime() + 3 * 3600_000);
  if (end.getTime() <= start.getTime()) end.setTime(start.getTime() + 2 * 3600_000);

  const totalMs = end.getTime() - start.getTime();

  // Nokta sayısı (ilk ve son dahil). +1: son nokta için
  let nPoints = Math.floor(totalMs / (STEP_SECONDS * 1000)) + 1;
  nPoints = Math.max(3, Math.min(MAX_POINTS, nPoints));

  const stepMs = totalMs / (nPoints - 1);

  const coords: Array<[number, number]> = [];
  for (let i = 0; i < nPoints; i++) {
    const t = i / (nPoints - 1); // 0..1 (sonda 1)
    const lat = from[0] + (to[0] - from[0]) * t;
    const lng = from[1] + (to[1] - from[1]) * t;
    coords.push([lat, lng]);
  }

  const out: Array<{
    ucusPlaniId: number; timestampUtc: string;
    latitude: number; longitude: number; altitude: number; heading: number;
  }> = [];

  for (let i = 0; i < nPoints; i++) {
    const isLast = i === nPoints - 1;

    // Zaman damgası: tam baş ve tam bitiş garanti
    const ts = isLast
      ? end.toISOString()
      : new Date(start.getTime() + Math.round(i * stepMs)).toISOString();

    // Heading: önceki noktadan bu noktaya gerçek yön
    const prev = i > 0 ? coords[i - 1] : coords[i];
    const cur  = coords[i];
    const heading = i > 0 ? bearingDeg(prev, cur) : bearingDeg(cur, coords[Math.min(1, coords.length - 1)]);

    out.push({
      ucusPlaniId: plan.id,
      timestampUtc: ts,
      latitude: cur[0],
      longitude: cur[1],
      altitude: 1200 + i * 5,
      heading
    });
  }

  // Debug: ilk/son kontrolü
  console.log(`#${plan.id} first=${out[0].timestampUtc} last=${out[out.length - 1].timestampUtc} (start=${start.toISOString()} end=${end.toISOString()})`);

  return out;
}

/* =========================
   MAIN
   ========================= */
async function run() {
  console.log("🛫 Simülatör (HISTORY seed) başlıyor…");

  const plans = await fetchPlans();
  if (!plans.length) {
    console.log("⚠️ Uçuş planı bulunamadı. Önce FlightPlanner ile plan ekle.");
    return;
  }
  console.log(`📋 ${plans.length} plan bulundu.`);

  const selected = plans.slice(0, FLIGHT_COUNT);

  for (const p of selected) {
    try {
      let from = p.origin?.trim().toUpperCase();
      let to   = p.destination?.trim().toUpperCase();
      if (!hasAirport(from) || !hasAirport(to) || from === to) {
        const keys = Object.keys(airports);
        from = keys[Math.floor(Math.random() * keys.length)];
        do { to = keys[Math.floor(Math.random() * keys.length)]; } while (to === from);
      }

      if (PURGE_BEFORE_SEED) {
        const del = await purgePositions(p.id);
        if (del > 0) console.log(`🧹 #${p.id} için ${del} kayıt silindi.`);
      }

      const route = generateHistoricalRoute(p, from!, to!);
      console.log(`✈️ #${p.id}: ${from} → ${to} (${route.length} nokta) gönderiliyor…`);
      await postInChunks(route, 500);
      console.log(`✅ #${p.id}: yazıldı`);
    } catch (e: any) {
      console.error(`❌ #${p.id} hata:`, e?.response?.status, e?.response?.statusText, e?.response?.data ?? e?.message ?? e);
    }
  }

  console.log("✅ Bitti.");
}

run().catch(e => {
  console.error("❌ Genel hata:", e?.response?.status, e?.response?.statusText, e?.response?.data ?? e?.message);
});
