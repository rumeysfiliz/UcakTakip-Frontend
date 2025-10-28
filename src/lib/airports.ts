// Küçük IATA → [lat,lng] sözlüğü. Lazım oldukça ekleyebilirsin.
export const airports: Record<string, [number, number]> = {
  /* === TÜRKİYE === */
  IST: [41.275, 28.751],   // İstanbul Havalimanı
  SAW: [40.898, 29.309],   // Sabiha Gökçen
  ESB: [40.124, 32.995],   // Ankara Esenboğa
  ADB: [38.292, 27.157],   // İzmir Adnan Menderes
  AYT: [36.898, 30.800],   // Antalya
  TZX: [40.995, 39.789],   // Trabzon
  ADA: [36.982, 35.280],   // Adana Şakirpaşa

  /* === AVRUPA === */
  AMS: [52.308, 4.764],    // Amsterdam Schiphol
  BER: [52.366, 13.503],   // Berlin Brandenburg
  FRA: [50.037, 8.562],    // Frankfurt
  MUC: [48.353, 11.786],   // Münih
  CDG: [49.009, 2.547],    // Paris Charles de Gaulle
  ORY: [48.727, 2.379],    // Paris Orly
  LHR: [51.470, -0.454],   // Londra Heathrow
  LGW: [51.156, -0.182],   // Londra Gatwick
  MAN: [53.365, -2.273],   // Manchester
  FCO: [41.799, 12.246],   // Roma Fiumicino
  MXP: [45.630, 8.728],    // Milano Malpensa
  ATH: [37.936, 23.944],   // Atina
  ZRH: [47.458, 8.548],    // Zürih
  BCN: [41.297, 2.078],    // Barselona
  MAD: [40.472, -3.561],   // Madrid
  LIS: [38.774, -9.134],   // Lizbon
  BRU: [50.901, 4.484],    // Brüksel
  VIE: [48.110, 16.570],   // Viyana
  PRG: [50.100, 14.260],   // Prag
  BUD: [47.439, 19.261],   // Budapeşte
  WAW: [52.166, 20.967],   // Varşova
  OSL: [60.194, 11.100],   // Oslo
  CPH: [55.618, 12.656],   // Kopenhag
  HEL: [60.317, 24.963],   // Helsinki
  DUB: [53.427, -6.243],   // Dublin
  ARN: [59.651, 17.918],   // Stockholm Arlanda

  /* === ORTADOĞU === */
  DXB: [25.253, 55.365],   // Dubai
  DOH: [25.274, 51.608],   // Doha Hamad
  RUH: [24.959, 46.698],   // Riyad
  JED: [21.679, 39.156],   // Cidde
  TLV: [32.000, 34.870],   // Tel Aviv Ben Gurion

  /* === ASYA === */
  NRT: [35.773, 140.392],  // Tokyo Narita
  HND: [35.552, 139.779],  // Tokyo Haneda
  ICN: [37.460, 126.440],  // Seul Incheon
  PEK: [40.080, 116.585],  // Pekin
  PVG: [31.144, 121.808],  // Şanghay Pudong
  HKG: [22.308, 113.918],  // Hong Kong
  SIN: [1.364, 103.991],   // Singapur Changi
  DEL: [28.556, 77.100],   // Delhi
  BOM: [19.089, 72.868],   // Mumbai
  BKK: [13.690, 100.750],  // Bangkok Suvarnabhumi
  KUL: [2.745, 101.709],   // Kuala Lumpur
  TPE: [25.080, 121.232],  // Taipei
  MNL: [14.509, 121.019],  // Manila
  HKT: [8.113, 98.317],    // Phuket

  /* === KUZEY AMERİKA === */
  JFK: [40.641, -73.778],  // New York JFK
  EWR: [40.689, -74.175],  // Newark
  BOS: [42.365, -71.009],  // Boston Logan
  MIA: [25.796, -80.291],  // Miami
  ATL: [33.640, -84.427],  // Atlanta
  DFW: [32.899, -97.040],  // Dallas/Fort Worth
  IAH: [29.984, -95.341],  // Houston
  ORD: [41.9786, -87.9048],// Chicago O’Hare
  LAX: [33.942, -118.408], // Los Angeles
  SFO: [37.618, -122.375], // San Francisco
  SEA: [47.450, -122.309], // Seattle
  YYZ: [43.677, -79.630],  // Toronto Pearson
  YVR: [49.194, -123.184], // Vancouver
  MEX: [19.436, -99.072],  // Mexico City Benito Juárez

  /* === GÜNEY AMERİKA === */
  GRU: [-23.434, -46.478], // São Paulo Guarulhos
  EZE: [-34.812, -58.539], // Buenos Aires Ezeiza
  SCL: [-33.393, -70.785], // Santiago de Chile
  LIM: [-12.021, -77.114], // Lima
  BOG: [4.701, -74.146],   // Bogota

  /* === AFRİKA === */
  CAI: [30.121, 31.406],   // Kahire
  CMN: [33.367, -7.589],   // Kazablanka
  JNB: [-26.139, 28.246],  // Johannesburg
  CPT: [-33.971, 18.602],  // Cape Town
  ADD: [8.978, 38.799],    // Addis Ababa
  NBO: [-1.319, 36.927],   // Nairobi
};

export function iataToLatLng(code?: string): [number, number] | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  return airports[c] ?? null;
}
