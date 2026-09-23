/* Stopword lists untuk bahasa Indonesia & Inggris (dipakai Mode Lokal) */
window.Stopwords = (function () {
  var ID = new Set(("yang dan di ke dari itu dengan untuk pada dalam adalah merupakan ialah yaitu dimana kepada akan telah tidak ada ini itu tersebut bagi bagi beserta sebagai agar supaya oleh karena tapi tetapi pun juga serta ataupun maupun atau antara setelah sebelum sejak selama ketika saat jika kalau bahkan maka sehingga sementara walaupun meskipun kendati sekalipun dapat bisa mungkin harus selalu sering jarang paling sangat amat sekali lebih kurang hanya memang saja terus kembali sudah telah belum masih sedang lagi pula lainnya berikut berikutnya tersbut tsb dll dst misalnya contohnya seperti halnya terhadap tentang dari pada mengenai terkait menurut berdasarkan sesuai sejalan dengan atas bawah dalamnya seluruh semua segala setiap tiap masing paling masing masih antarkan".split(/\s+/)));

  var EN = new Set(("the and or but if while when where what which who whom that these those this that is are was were be been being have has had do does did will would shall should can could may might must of to in on at by for with about against between into through during before after above below from up down out off over under again further then once here there when where why how all any both each few more most other some such no nor not only own same so than too very can just don now".split(/\s+/)));

  function isStopword(w) {
    return ID.has(w) || EN.has(w) || w.length <= 2;
  }

  function getStopwords() {
    return { id: ID, en: EN };
  }

  return { isStopword: isStopword, getStopwords: getStopwords };
})();