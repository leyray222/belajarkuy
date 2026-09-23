/* Generate kuis pilihan ganda lokal dari teks */
window.QuizGen = (function () {
  function escapeRe(w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function build(text, opts) {
    opts = opts || {};
    var sentences = TextUtil.splitSentences(text);
    var terms = TextUtil.keyTerms(text, 30).map(function (t) { return t.word; });
    var questions = [];
    var seen = new Set();

    function termSentence(term) {
      var re = new RegExp("\\b" + escapeRe(term) + "\\b", "i");
      var defS = null, shortS = null;
      for (var i = 0; i < sentences.length; i++) {
        if (!re.test(sentences[i])) continue;
        if (!shortS || sentences[i].length < shortS.length) shortS = sentences[i];
        if (/adalah|merupakan|ialah|yaitu|yakni|didefinisikan|means|refers to|is called/i.test(sentences[i]) && !defS) defS = sentences[i];
      }
      return defS || shortS;
    }

    for (var i = 0; i < terms.length && questions.length < (opts.maxQ || 10); i++) {
      var term = terms[i];
      if (seen.has(term) || term.length < 3) continue;
      var s = termSentence(term);
      if (!s) continue;
      var qtext = s.replace(new RegExp("\\b" + escapeRe(term) + "\\b", "i"), "____");
      if (qtext === s) continue;

      var distract = terms.filter(function (t) {
        return t !== term && t.length >= 3 && !new RegExp("\\b" + escapeRe(t) + "\\b", "i").test(qtext);
      });
      var used = new Set([term]);
      var options = [{ text: term, correct: true }];
      for (var d = 0; d < distract.length && options.length < 4; d++) {
        if (used.has(distract[d])) continue;
        used.add(distract[d]);
        options.push({ text: distract[d], correct: false });
      }
      if (options.length < 2) continue;
      shuffle(options);
      seen.add(term);
      questions.push({ q: qtext, options: options, term: term });
    }
    return questions;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  return { build: build, shuffle: shuffle };
})();
if (typeof globalThis !== "undefined" && window.QuizGen) globalThis.QuizGen = window.QuizGen;