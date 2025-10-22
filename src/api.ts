import axios from 'axios'
import type { UcusPlani, UcakKonum } from './types' ////Dönen/verilen veriyi TypeScript ile güvence altına almak

//axios tercih etmemizin sebebi ortak baseURL, varsayılan header vb. ayarları tek yerde kullanabilmek.
//Her yere localhost yazmak yerine tek bir istemci oluşturmak.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL })

/* import.meta.env.VITE_API_URL: Vite’ın env mekanizması.
  Geliştirme → https://localhost:7229
  Dağıtım → (ör. prod URL)
  Böylece adres değişiminde tek bir env yeter. */


// Dashboard ilk açıldığında uçuş planlarını listelemek için kullandık.
export async function getFlights(): Promise<UcusPlani[]> {
  const { data } = await api.get<UcusPlani[]>('/api/UcusPlani')
  return data
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

// Büyük aralıkları sayfalı okumak için 
 // /aralık endpoint'ini sayfa sayfa dolaşır, tüm sonuçları tek diziye toplar.
 // Neden gerekli? Bir uçuş saatlerce/günlerce kaydedildiğinde gerRangePosition da tek sayfayla istek almak hem yavaş hem de backend zaman aşımı olabilir
export async function getTrailRangeAll(
  ucusPlaniId: number,
  fromUtc: string,   
  toUtc: string,
  pageSize = 1000,
  onChunk?: (rows: UcakKonum[]) => void
): Promise<UcakKonum[]> {
  let page = 1;
  const all: UcakKonum[] = [];
  for (;;) {
    const { data } = await api.get<UcakKonum[]>("/api/UcakKonumu/aralik", {
      params: { ucusPlaniId, fromUtc, toUtc, page, pageSize }
    });
    if (!data || data.length === 0) break;
    all.push(...data);
    onChunk?.(data);
    if (data.length < pageSize) break; // son sayfa
    page++;
  }
  // zaman sırasına göre garanti edelim ki rota çizerken sapıtmasın.
  all.sort((a,b)=> new Date(a.timestampUtc).getTime() - new Date(b.timestampUtc).getTime());
  return all;
}
// onChunk her sayfa geldiğinde UI'ya parça parça iletmek için. 


// POST /api/UcusPlani
// Yeni uçuş planı kaydetmek için.
export async function postFlight(
  input: Omit<UcusPlani, 'id' | 'createdAtUtc' | 'ucakKonumlari'>
): Promise<UcusPlani> {
  const { data } = await api.post<UcusPlani>('/api/UcusPlani', input);
  return data;
}

// Oluşturulmuş UcusPlani bunu alıp listeye ekleriz ve UI anıonda güncellenir.
/* Omit<...> Kullanımı : Frontend formu bu alanları göndermez.
  - id (sunucu oluşturur)
  - createAtUtc (sunucu set ediyor)
  - ucakKonumlari (başlangıçta boş)
  Böylece kullanıcının değiştirmemesi gerken alanları tipe dahil etmemiş oluyoruz.
*/