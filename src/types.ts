//Backend ile frontend'in aynı dili konuşmasını sağlıyor. Burada ne varsa, backend’teki modellerin (entity’lerin) aynısı ama TS uyumlu hali.

export type UcakKonum = {
  id: number
  ucusPlaniId: number
  timestampUtc: string
  latitude: number
  longitude: number
  altitude?: number | null
  heading?: number | null
}

export type UcusPlani = {
  id: number
  code: string
  startTimeUtc: string
  endTimeUtc?: string | null
  // YENİ: koordinatlar (geçişte backend bazen null dönebilir)
  originLat?: number | null
  originLng?: number | null
  destinationLat?: number | null
  destinationLng?: number | null
  origin: string
  destination: string
  createdAtUtc: string
  ucakKonumlari?: UcakKonum[]
}


