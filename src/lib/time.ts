//Sistemdeki tüm zamanların doğru görünmesi için yardımcı dosya
//Bu fonksiyonlar backendden gelen UTC tarihleri TSİ çeviriyor


//Bu fonk UTC saati alıyor ve TSİ çeviriyor
export function toTurkeyTime(utcString: string) {
  const d = new Date(utcString)
  // Türkiye UTC+3 → doğrudan saat 
  d.setHours(d.getHours() + 3)
  return d
}

//Bu fonkda ekranda TSİ formatında göstermek için Kartlarda ve bilgi alanlarında kullanıyorum.
export function fmtTurkeyTime(utcString: string) {
  const dt = new Date(utcString);
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dt);
}