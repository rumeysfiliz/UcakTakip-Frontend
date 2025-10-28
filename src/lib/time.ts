//Sistemdeki tüm zamanların doğru görünmesi için yardımcı dosya
//Bu fonksiyonlar backendden gelen UTC tarihleri TSİ çeviriyor


//Bu fonk UTC saati alıyor ve TSİ çeviriyor
// UTC string'i TSİ'ye doğru biçimde çevir
export function toTurkeyTime(utcString: string) {
  // eğer gelen string'in sonunda Z veya +03:00 gibi bir timezone bilgisi yoksa UTC varsay
  const s = /Z$|[+\-]\d{2}:\d{2}$/.test(utcString) ? utcString : utcString + 'Z';
  return new Date(s);
}


//Bu fonkda ekranda TSİ formatında göstermek için Kartlarda ve bilgi alanlarında kullanıyorum.
export function fmtTurkeyTime(utcLike: string | Date) {
  const s = utcLike instanceof Date
    ? utcLike.toISOString()
    : /Z$|[+\-]\d{2}:\d{2}$/.test(utcLike) ? utcLike : utcLike + 'Z';

  const dt = new Date(s);
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


