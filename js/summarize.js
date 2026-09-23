/* Ringkasan ekstraktif lokal (tanpa API) */
window.Summarizer = (function () {
  var DEF_MARKERS = /(adalah|merupakan|ialah|yaitu|yakni|yaitu:|berarti|didefinisikan sebagai|is defined as|refers to|means|consists of|dapat diartikan)/i;
  var QUESTION_MARKERS = /^(apa|bagaimana|mengapa|kenapa|siapa|kapan|dimana|di mana|apakah|sebutkan|jelaskan)/i;

  function scoreSentences(sentences, freq) {
    var scored = [];
    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i];
      var words = TextUtil.tokenize(s);
      var contentWords = words.filter(function (w) { return !Stopwords.isStopword(w); });
      var sum = 0;
      for (var j = 0; j < contentWords.length; j++) sum += freq.get(contentWords[j]) || 1;
      var score = sum / Math.sqrt(words.length + 1);
      if (i < sentences.length * 0.1) score *= 1.25;          // intro awal lebih penting
      if (DEF_MARKERS.test(s)) score *= 1.3;                  // definisi penting
      if (QUESTION_MARKERS.test(s)) score *= 0.5;             // kalimat tanya kurang penting
      scored.push({ s: s, score: score, i: i });
    }
    return scored;
  }

  function summarize(text, opts) {
    opts = opts || {};
    var maxPoints = opts.maxPoints || Math.max(4, Math.min(10, Math.round(TextUtil.countWords(text) / 250)));
    var sentences = TextUtil.splitSentences(text);
    if (sentences.length <= maxPoints) return sentences;
    var freq = TextUtil.wordFrequencies(text);
    var scored = scoreSentences(sentences, freq).sort(function (a, b) { return b.score - a.score; });

    var chosen = [];
    var lambda = 0.55;
    while (chosen.length < maxPoints) {
      var best = null, bestVal = -Infinity;
      for (var i = 0; i < scored.length; i++) {
        var ss = scored[i];
        if (chosen.indexOf(ss) !== -1) continue;
        var diversity = 0;
        for (var j = 0; j < chosen.length; j++) diversity = Math.max(diversity, TextUtil.similarity(ss.s, chosen[j].s));
        var val = ss.score - lambda * diversity;
        if (val > bestVal) { bestVal = val; best = ss; }
      }
      if (!best) break;
      chosen.push(best);
    }
    chosen.sort(function (a, b) { return a.i - b.i; });
    return chosen.map(function (c) { return c.s; });
  }

  return { summarize: summarize };
})();
if (typeof globalThis !== "undefined" && window.Summarizer) globalThis.Summarizer = window.Summarizer;