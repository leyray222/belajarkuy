/* Generate flashcard lokal dari teks */
window.Flashcards = (function () {
  var PATTERNS = [
    /(.{4,90}?)\s+(adalah|merupakan|ialah|yaitu|yakni)\s+(.+)/i,
    /(.{4,90}?)\s+(didefinisikan sebagai|diartikan sebagai|dapat diartikan sebagai)\s+(.+)/i,
    /(.{4,90}?)\s+(is defined as|refers to|means|is called)\s+(.+)/i,
    /(.{4,90}?)\s+adalah\s+(.+)/i
  ];
  var LEAD_NOISE = /^(yang|sebuah|suatu|para|beberapa|istilah|kata|dalam|pada|di|dari|untuk|bahwa|ini|itu|the|a|an)\s+/i;

  function cleanTerm(t) {
    return t.replace(/^[\s:;,"'-]+|[\s:;,"'-]+$/g, "").replace(LEAD_NOISE, "").trim();
  }

  function build(text) {
    var sentences = TextUtil.splitSentences(text);
    var cards = [];
    var seen = new Set();

    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i];
      for (var p = 0; p < PATTERNS.length; p++) {
        var m = s.match(PATTERNS[p]);
        if (!m) continue;
        var term = cleanTerm(m[1]);
        if (term.length < 2 || term.length > 60) break;
        var key = term.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cards.push({ q: "Apa itu \u201c" + term + "\u201d?", a: s });
        break;
      }
    }

    /* Fallback: ambil istilah penting + kalimat terpendek yang memuatnya */
    var freq = TextUtil.wordFrequencies(text);
    var used = new Set();
    cards.sort(function (x, y) { return y.q.length - x.q.length; });

    var i2 = 0;
    while (cards.length < 12 && i2 < 25) {
      var cands = TextUtil.keyTerms(text, 40);
      if (i2 >= cands.length) break;
      var term = cands[i2].word;
      i2++;
      if (seen.has(term)) continue;
      var holding = sentences.filter(function (s) { return new RegExp("\\b" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(s); });
      if (!holding.length) continue;
      holding.sort(function (a, b) { return a.length - b.length; });
      seen.add(term);
      cards.push({ q: "Jelaskan \u201c" + term + "\u201d berdasarkan materi.", a: holding[0] });
    }

    if (cards.length === 0 && sentences.length > 0) {
      var top = sentences.slice(0, 8);
      for (var k = 0; k < top.length; k++) {
        cards.push({ q: "Poin penting apa dari kalimat ini?", a: top[k] });
      }
    }
    return cards;
  }

  return { build: build };
})();
if (typeof globalThis !== "undefined" && window.Flashcards) globalThis.Flashcards = window.Flashcards;