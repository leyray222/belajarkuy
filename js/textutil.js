/* Utilitas teks untuk proses lokal */
window.TextUtil = (function () {
  function clean(text) {
    return String(text || "")
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /* Pisah menjadi kalimat dak luar-kata. Jaga singkatan umum agar tidak terpotong. */
  function splitSentences(text) {
    var t = clean(text);
    if (!t) return [];
    // tandai titik pada singkatan umum
    t = t.replace(/\b(mis|misal|misalnya|contoh|dll|dst|dr|no|sdr|Prof|Dr|Mr|Mrs|Ms|St|Apt|vs)\./gi, function (m) {
      return m.replace(".", "@");
    });
    var parts = t.split(/(?<=[.!?…])[\s\n]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].replace(/@/g, ".").replace(/^[\s"'\u201c\u201d(-]+|[\s"'\u201c\u201d).,-]+$/g, "").trim();
      if (s.length >= 4 && /\p{L}/u.test(s)) out.push(s);
    }
    return out;
  }

  function tokenize(text) {
    return String(text || "").toLowerCase().match(/[\p{L}0-9]+/gu) || [];
  }

  function countWords(text) {
    return (String(text || "").match(/\b[\p{L}0-9-]+\b/gu) || []).length;
  }

  function wordFrequencies(text) {
    var freq = new Map();
    var words = tokenize(text);
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (Stopwords.isStopword(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    return freq;
  }

  /* Ekstrak kata kunci (term): kata non-stopword populer, tanpa duplikat stem-ish. */
  function keyTerms(text, limit) {
    limit = limit || 24;
    var freq = wordFrequencies(text);
    var arr = [];
    freq.forEach(function (f, w) {
      if (w.length > 2) arr.push({ word: w, score: f });
    });
    arr.sort(function (a, b) { return b.score - a.score; });
    var seen = new Set();
    var out = [];
    for (var i = 0; i < arr.length && out.length < limit; i++) {
      var base = arr[i].word.replace(/s$/i, "");
      if (seen.has(base)) continue;
      seen.add(base);
      out.push(arr[i]);
    }
    return out;
  }

  function similarity(a, b) {
    var ta = tokenize(a), tb = tokenize(b);
    if (!ta.length || !tb.length) return 0;
    var sa = new Set(ta), sb = new Set(tb);
    var inter = 0;
    sa.forEach(function (w) { if (sb.has(w)) inter++; });
    return inter / Math.sqrt(sa.size * sb.size);
  }

  return {
    clean: clean,
    splitSentences: splitSentences,
    tokenize: tokenize,
    countWords: countWords,
    wordFrequencies: wordFrequencies,
    keyTerms: keyTerms,
    similarity: similarity
  };
})();
if (typeof globalThis !== "undefined" && window.TextUtil) globalThis.TextUtil = window.TextUtil;