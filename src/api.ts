import axios from 'axios'
import type { UcusPlani, UcakKonum } from './types' ////Dönen/verilen veriyi TypeScript ile güvence altına almak

//axios tercih etmemizin sebebi ortak baseURL, varsayılan header vb. ayarları tek yerde kullanabilmek.
//Her yere localhost yazmak yerine tek bir istemci oluşturmak.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL })

/* import.meta.env.VITE_API_URL: Vite’ın env mekanizması.
  Geliştirme → https://localhost:7229
  Dağıtım → (ör. prod URL)
  Böylece adres değişiminde tek bir env yeter. */

export async function getFlights(): Promise<UcusPlani[]> {
  const res = await api.get("/UcusPlani")
  return res.data
}

export async function postFlightCoords(body: {
  code: string
  startTimeUtc: string
  endTimeUtc?: string | null
  originLat: number
  originLng: number
  destinationLat: number
  destinationLng: number
}): Promise<UcusPlani> {
  const res = await api.post("/api/UcusPlani", body)
  return res.data
}

// örnek: ±1 gün liste
export async function getFlightsByDateRange(utcStartIso: string, utcEndIso: string): Promise<UcusPlani[]> {
  const res = await api.get("/UcusPlani/tarih", {
    params: { start: utcStartIso, end: utcEndIso },
  })
  return res.data as UcusPlani[]
}


// GET /api/UcakKonumu/son-konum/{id}
// Uçuşun son konumunu döndürüyor. 
// Neden data ?? null => Backend undefined (tanımlanmamış) döndürürse bile frontend tarafından tutarlı bir boş değerimiz olsun.
export async function getLastPosition(ucusPlaniId: number): Promise<UcakKonum | null> {
  try {
    const { data } = await api.get<UcakKonum>(`/api/UcakKonumu/son-konum/${ucusPlaniId}`)
    return data ?? null
  } catch {
    return null
  }
}


// GET /api/UcakKonumu/aralik
// Zaman aralığındaki konumlar. Replay için rotaları yüklerken kullanıyoruz.
export async function getRangePositions(ucusPlaniId: number, fromUtc: string, toUtc: string) {
  const { data } = await api.get<UcakKonum[]>('/api/UcakKonumu/aralik', {
    params: { ucusPlaniId, fromUtc, toUtc, page: 1, pageSize: 2000 }
  })
  return data
}

// POST /api/UcusPlani
// Yeni uçuş planı kaydetmek için.
export async function postFlight(
  input: Omit<UcusPlani, 'id' | 'createdAtUtc' | 'ucakKonumlari'>
): Promise<UcusPlani> {
  const { data } = await api.post<UcusPlani>('/api/UcusPlani', input);
  return data;
}

//Tek konum kaydı(ör origini hemen gösteermelik basmak)
export async function postPosition(body: Omit<UcakKonum, 'id'>) {
  await api.post('/api/UcakKonumu', body)
}
// Oluşturulmuş UcusPlani bunu alıp listeye ekleriz ve UI anıonda güncellenir.
/* Omit<...> Kullanımı : Frontend formu bu alanları göndermez.
  - id (sunucu oluşturur)
  - createAtUtc (sunucu set ediyor)
  - ucakKonumlari (başlangıçta boş)
  Böylece kullanıcının değiştirmemesi gerken alanları tipe dahil etmemiş oluyoruz.
*/