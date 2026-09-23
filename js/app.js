/* BelajarKuy — logika aplikasi utama */
(function () {
  "use strict";

  /* ---------- DOM helpers ---------- */
  function $(id) { return document.getElementById(id); }

  /* ---------- State ---------- */
  const DOC_KEY = "belajarkuy_doc";
  const state = {
    title: "",
    text: "",
    summary: [],
    cards: [],
    quiz: []
  };
  const chatHistory = [];

  /* ---------- Toast & loading ---------- */
  let toastTimer = null;
  function toast(msg, type) {
    const el = $("globalToast");
    el.textContent = msg;
    el.className = "toast" + (type ? " " + type : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3800);
  }
  function showLoading(text) {
    $("loadingText").textContent = text || "Memproses...";
    $("loadingOverlay").hidden = false;
  }
  function hideLoading() { $("loadingOverlay").hidden = true; }

  /* ---------- View routing ---------- */
  function showView(name) {
    $("view-home").hidden = name !== "home";
    $("view-app").hidden = name !== "apps";
    if (name === "apps") renderByState();
    if (name === "home") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- Theme ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("belajarkuy_theme", t);
    $("themeToggle").textContent = t === "dark" ? "☀️" : "🌙";
  }
  function initTheme() {
    let t = localStorage.getItem("belajarkuy_theme");
    if (!t) {
      const pref = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      t = pref ? "dark" : "light";
    }
    applyTheme(t);
  }

  /* ---------- Settings ---------- */
  let aiConfigured = AIService.isConfigured();

  function openSettings() {
    const s = AIService.getSettings();
    $("aiProvider").value = s.provider || "";
    $("aiApiKey").value = s.apiKey || "";
    $("aiModel").value = s.model || "";
    updateModelPlaceholder();
    $("settingsModal").hidden = false;
    $("settingsToast").hidden = true;
  }

  function updateModelPlaceholder() {
    const p = $("aiProvider").value;
    const conf = { gemini: "gemini-2.0-flash", openrouter: "meta-llama/llama-3.3-70b-instruct", openai: "gpt-4o-mini" };
    $("aiModel").placeholder = "contoh: " + (conf[p] || "gemini-2.0-flash");
  }

  function saveSettings() {
    const provider = $("aiProvider").value;
    const apiKey = $("aiApiKey").value.trim();
    const model = $("aiModel").value.trim();
    if (provider && !apiKey) {
      showSettingsToast("Isi API key dulu, atau pilih \u201cMode Lokal\u201d.", "err");
      return;
    }
    AIService.saveSettings({ provider: provider, apiKey: apiKey, model: model });
    aiConfigured = AIService.isConfigured();
    updateModeBadge();
    showSettingsToast("Tersimpan ✔");
  }

  function showSettingsToast(msg, type) {
    const el = $("settingsToast");
    el.textContent = msg;
    el.className = "toast" + (type ? " " + type : " " + "ok");
    el.hidden = false;
  }

  /* ---------- Mode badge ---------- */
  function updateModeBadge() {
    const b = $("modeBadge");
    if (aiConfigured) {
      b.textContent = "AI Online";
      b.classList.add("online");
    } else {
      b.textContent = "Mode Lokal";
      b.classList.remove("online");
    }
  }

  /* ---------- Persist doc ---------- */
  function saveDoc() {
    try {
      localStorage.setItem(DOC_KEY, JSON.stringify({
        title: state.title,
        text: state.text,
        summary: state.summary || [],
        cards: state.cards || [],
        quiz: state.quiz || []
      }));
    } catch (e) {}
  }
  function loadDoc() {
    try {
      const raw = localStorage.getItem(DOC_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.text) {
          state.title = d.title || "Materi";
          state.text = d.text;
          state.summary = Array.isArray(d.summary) ? d.summary : [];
          state.cards = Array.isArray(d.cards) ? d.cards : [];
          state.quiz = Array.isArray(d.quiz) ? d.quiz : [];
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function newMaterial(title, text) {
    state.title = title;
    state.text = text;
    state.summary = [];
    state.cards = [];
    state.quiz = [];
    chatHistory.length = 0;
    saveDoc();
  }

  /* ---------- Text preview for AI ---------- */
  function textPreview(text, maxLen) {
    maxLen = maxLen || 14000;
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + "\n\n[...] (materi dipotong agar muat; beberapa bagian di bawah sengaja dihilangkan)";
  }

  /* ---------- Upload handling ---------- */
  function initUpload() {
    const fileInput = $("fileInput");
    const dropzone = $("dropzone");

    fileInput.addEventListener("change", function () {
      const file = fileInput.files && fileInput.files[0];
      if (file) handleFile(file);
      fileInput.value = "";
    });

    ["dragenter", "dragover"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        dropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) {
        e.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });
    dropzone.addEventListener("drop", function (e) {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });

    $("btnProcessPaste").addEventListener("click", function () {
      const t = $("pasteArea").value.trim();
      if (t.length < 20) {
        setNote("Teks terlalu pendek. Minimal 20 karakter.", "err");
        return;
      }
      newMaterial("Teks Tempelan", TextUtil.clean(t));
      processDocument();
    });

    $("pasteArea").addEventListener("input", function () {
      const t = this.value.trim();
      $("btnProcessPaste").disabled = t.length < 20;
    });
    $("btnProcessPaste").disabled = true;

    $("btnFetchYT").addEventListener("click", async function () {
      const url = $("ytInput").value.trim();
      if (!url) { toast("Tempel link YouTube dulu ya", "err"); return; }
      showLoading("Mengambil transkrip YouTube...");
      try {
        const text = await Extractor.fetchYouTubeTranscript(url);
        if (!text || text.length < 20) throw new Error("Transkrip kosong");
        hideLoading();
        newMaterial("YouTube: " + url, text);
        processDocument();
      } catch (e) {
        hideLoading();
        setNote(e.message, "err");
        toast(e.message, "err");
      }
    });
  }

  function handleFile(file) {
    setNote("");
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const AVM = ["mp3", "wav", "mp4", "mov", "m4a", "ogg", "webm", "m4v", "aac"];
    showLoading("Membaca " + file.name + "...");
    if (AVM.indexOf(ext) !== -1) {
      handleMedia(file);
      return;
    }
    Extractor.extractFile(file)
      .then(function (text) {
        hideLoading();
        if (!text || text.length < 20) throw new Error("Tidak ada teks yang terbaca dari file ini.");
        newMaterial(file.name, text);
        processDocument();
      })
      .catch(function (e) {
        hideLoading();
        setNote(e.message, "err");
        toast(e.message, "err");
      });
  }

  function handleMedia(file) {
    if (!aiConfigured) {
      hideLoading();
      const msg = "Untuk memproses file audio/video butuh transkripsi. Tambahkan API key Gemini gratis di ⚙️, atau gunakan link YouTube, atau tempel transkripnya manual.";
      setNote(msg, "err");
      toast(msg, "err");
      return;
    }
    if (file.size > 18 * 1024 * 1024) {
      hideLoading();
      const msg = "File terlalu besar untuk transkripsi browser (maks 18 MB). Gunakan link YouTube atau potong audionya.";
      setNote(msg, "err");
      return;
    }
    file.arrayBuffer().then(function (buf) {
      return AIService.transcribeMedia(buf, file.type || "audio/mpeg");
    }).then(function (text) {
      hideLoading();
      if (!text || text.length < 20) throw new Error("Transkripsi kosong.");
      newMaterial(file.name + " (transkrip)", TextUtil.clean(text));
      processDocument();
    }).catch(function (e) {
      hideLoading();
      setNote(e.message, "err");
      toast(e.message, "err");
    });
  }

  function setNote(msg, type) {
    const n = $("noteText");
    n.textContent = msg;
    n.className = "note" + (type ? " " + type : "");
  }

  /* ---------- Main processing ---------- */
  async function processDocument() {
    const hasAll = state.summary.length && state.cards.length && state.quiz.length;
    if (!hasAll) {
      showLoading("Memproses materi (ringkasan, flashcard, kuis)...");
      try {
        state.summary = await buildSummary();
        state.cards = await buildCards();
        state.quiz = await buildQuiz();
      } catch (e) {
        hideLoading();
        toast("Terjadi kesalahan: " + e.message, "err");
        return;
      }
      hideLoading();
      saveDoc();
    }
    showView("apps");
    renderByState();
    updateModeBadge();
    if (!hasAll) toast("Materi berhasil diproses! 🎉", "ok");
  }

  async function buildSummary() {
    if (aiConfigured) {
      const extra = $("summaryPrompt") ? $("summaryPrompt").value.trim() : "";
      try {
        const sys = "Kamu adalah asisten belajar untuk pelajar Indonesia. Balas HANYA dengan JSON array berisi string, contoh: [\"poin 1\", \"poin 2\"]. Jangan sertakan teks lain.";
        const user = "Buat ringkasan penting materi berikut dalam bahasa Indonesia, 5-12 poin, bahasa sederhana dan mudah dipahami. " +
          (extra ? "Instruksi tambahan: " + extra + ". " : "") +
          "HANYA JSON:\n\nMATERI:\n" + textPreview(state.text);
        const out = await AIService.textComplete(sys, user, { temperature: 0.4 });
        const arr = AIService.parseJsonStrict(out);
        if (Array.isArray(arr) && arr.length >= 2) return arr.map(function (s) { return String(s); });
      } catch (e) {
        console.warn("AI summary gagal, fallback lokal:", e.message);
      }
    }
    return Summarizer.summarize(state.text);
  }

  async function buildCards() {
    if (aiConfigured) {
      try {
        const sys = "Kamu membuat flashcard belajar. Balas HANYA dengan JSON array, contoh: [{\"q\":\"Pertanyaan?\",\"a\":\"Jawaban\"}]. Jangan sertakan teks lain.";
        const user = "Buat 12 flashcard dari materi berikut. Pertanyaan ringkas, jawaban padat & akurat dalam bahasa Indonesia. HANYA JSON:\n\nMATERI:\n" + textPreview(state.text, 10000);
        const out = await AIService.textComplete(sys, user, { temperature: 0.5 });
        const arr = AIService.parseJsonStrict(out);
        if (Array.isArray(arr) && arr.length >= 3) {
          const cards = arr.filter(function (c) { return c && c.q && c.a; }).map(function (c) { return { q: String(c.q), a: String(c.a) }; });
          if (cards.length >= 3) return cards;
        }
      } catch (e) {
        console.warn("AI cards gagal, fallback lokal:", e.message);
      }
    }
    return Flashcards.build(state.text);
  }

  async function buildQuiz() {
    if (aiConfigured) {
      try {
        const sys = "Kamu membuat soal pilihan ganda. Balas HANYA dengan JSON array, format: [{\"q\":\"pertanyaan\",\"options\":[{\"text\":\"opsi\",\"correct\":true/false}]}]. Tiap soal punya tepat 4 opsi dan tepat 1 correct. Jangan sertakan teks lain.";
        const user = "Buat 8 soal pilihan ganda dari materi berikut, dalam bahasa Indonesia. HANYA JSON:\n\nMATERI:\n" + textPreview(state.text, 10000);
        const out = await AIService.textComplete(sys, user, { temperature: 0.5 });
        const arr = AIService.parseJsonStrict(out);
        if (Array.isArray(arr) && arr.length >= 3) {
          const qs = arr.filter(function (q) {
            return q && q.q && Array.isArray(q.options) && q.options.length >= 2 && q.options.some(function (o) { return o.correct; });
          }).map(function (q) {
            return {
              q: String(q.q),
              options: q.options.map(function (o) { return { text: String(o.text), correct: !!o.correct }; })
            };
          });
          if (qs.length >= 3) {
            qs.forEach(function (q) { QuizGen.shuffle(q.options); });
            return qs;
          }
        }
      } catch (e) {
        console.warn("AI quiz gagal, fallback lokal:", e.message);
      }
    }
    return QuizGen.build(state.text);
  }

  /* ---------- Render dashboard ---------- */
  function renderByState() {
    $("state-upload").hidden = Boolean(state.text);
    $("state-dashboard").hidden = !state.text;
    if (!state.text) return;

    $("docTitle").textContent = state.title || "Materi";
    $("statWords").textContent = TextUtil.countWords(state.text).toLocaleString("id-ID") + " kata";
    $("statChars").textContent = state.text.length.toLocaleString("id-ID") + " karakter";
    updateModeBadge();

    renderSummary();
    if (state.cards.length) {
      $("cardEmpty").hidden = true;
      $("flashcardWrap").hidden = false;
      renderCards();
    } else {
      $("cardEmpty").hidden = false;
      $("flashcardWrap").hidden = true;
    }
    if (state.quiz.length) { renderQuiz(); } else { $("quizContent").innerHTML = '<div class="empty-hint">Belum ada kuis.</div>'; }
  }

  function renderSummary() {
    const c = $("summaryContent");
    if (!state.summary.length) {
      c.innerHTML = '<div class="empty-hint">Tekan "Proses Materi" dulu ya 👆</div>';
      return;
    }
    c.innerHTML = state.summary.map(function (s, i) {
      const esc = escapeHtml(s);
      return '<div class="summary-item"><div class="num">' + (i + 1) + "</div><div>" + esc + "</div></div>";
    }).join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- Flashcard engine ---------- */
  let deck = [];
  let deckPos = 0;
  let matched = 0;

  function renderCards() {
    deck = state.cards.slice();
    deckPos = 0;
    matched = 0;
    $("cardQ").textContent = deck.length ? deck[0].q : "—";
    $("cardA").textContent = deck.length ? deck[0].a : "—";
    $("cardCount").textContent = deck.length ? "1 / " + deck.length + " · 0 dihafal" : "0 kartu";
    setCardFlipped(false);
  }

  function currentCard() { return deck[deckPos]; }

  function setCardFlipped(v) {
    const inner = document.querySelector(".card-inner");
    if (inner) inner.classList.toggle("flipped", v);
  }

  function goCard(dir) {
    if (!deck.length) return;
    deckPos = (deckPos + dir + deck.length) % deck.length;
    const c = currentCard();
    $("cardQ").textContent = c.q;
    $("cardA").textContent = c.a;
    updateCardCount();
    setCardFlipped(false);
  }

  function updateCardCount() {
    $("cardCount").textContent = (deckPos + 1) + " / " + deck.length + " · " + matched + " dihafal";
  }

  function rateCard(rate) {
    if (!deck.length) return;
    const c = currentCard();
    const ratings = JSON.parse(localStorage.getItem("belajarkuy_ratings") || "{}");
    const key = c.q;
    const prev = ratings[key] || 0;
    if (rate === 2) {
      ratings[key] = prev + 1;
      if (prev >= 1) { matched++; deck.splice(deckPos, 1); if (deck.length === 0) { finishDeck(); return; } if (deckPos >= deck.length) deckPos = 0; }
    } else if (rate === 1) {
      ratings[key] = Math.max(0, prev - 1);
      deckPos = (deckPos + 1) % deck.length;
    } else {
      ratings[key] = 0;
      const moveTo = (deckPos + 3) % deck.length;
      deck.splice(deckPos, 1);
      deck.splice(moveTo, 0, c);
    }
    localStorage.setItem("belajarkuy_ratings", JSON.stringify(ratings));
    if (deck.length) {
      const c2 = currentCard();
      $("cardQ").textContent = c2.q;
      $("cardA").textContent = c2.a;
      updateCardCount();
    }
    setCardFlipped(false);
  }

  function finishDeck() {
    deck = state.cards.slice();
    matched = 0;
    deckPos = 0;
    $("cardQ").textContent = deck[0].q;
    $("cardA").textContent = deck[0].a;
    toast("Semua kartu dihafal! 🎉 Deck diulang untuk penguatan.", "ok");
    updateCardCount();
  }

  function initFlashcardUI() {
    $("cardFlip").addEventListener("click", function () {
      if (!deck.length) return;
      const inner = document.querySelector(".card-inner");
      if (inner) inner.classList.toggle("flipped");
    });
    $("cardPrev").addEventListener("click", function () { goCard(-1); });
    $("cardNext").addEventListener("click", function () { goCard(1); });
    document.querySelectorAll(".rate-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".rate-btn").forEach(function (b) { b.classList.remove("active-rate"); });
        btn.classList.add("active-rate");
        rateCard(parseInt(btn.dataset.rate, 10));
        setTimeout(function () { btn.classList.remove("active-rate"); }, 400);
      });
    });
  }

  function regenCards() {
    showLoading("Membuat flashcard baru...");
    buildCards().then(function (cards) {
      state.cards = cards;
      hideLoading();
      renderByState();
      toast("Flashcard diperbarui", "ok");
    }).catch(function (e) { hideLoading(); toast(e.message, "err"); });
  }

  /* ---------- Quiz engine ---------- */
  let quizState = [];
  function renderQuiz() {
    quizState = state.quiz.map(function (q) { return { answered: false, correct: false }; });
    $("quizScore").textContent = "";
    const c = $("quizContent");
    c.innerHTML = state.quiz.map(function (q, i) {
      const optsHtml = q.options.map(function (o, oi) {
        return '<button class="quiz-opt" data-q="' + i + '" data-opt="' + oi + '">' + escapeHtml(o.text) + "</button>";
      }).join("");
      return '<div class="quiz-question" id="qq' + i + '">' +
        '<div class="quiz-qn"><span class="num">' + (i + 1) + "</span>" +
        '<span class="quiz-qt">' + escapeHtml(q.q) + "</span></div>" +
        '<div class="quiz-opts">' + optsHtml + "</div>" +
        '<div class="quiz-feedback" id="qf' + i + '"></div>' +
        "</div>";
    }).join("") +
      '<div class="quiz-actions"><button class="btn btn-primary" id="btnQuizSubmit">✅ Periksa Jawaban</button></div>';
    c.querySelectorAll(".quiz-opt").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const qi = parseInt(btn.dataset.q, 10);
        const oi = parseInt(btn.dataset.opt, 10);
        if (quizState[qi].answered) return;
        btn.closest(".quiz-opts").querySelectorAll(".quiz-opt").forEach(function (b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
      });
    });
    $("btnQuizSubmit").addEventListener("click", checkQuiz);
  }

  function checkQuiz() {
    let score = 0;
    state.quiz.forEach(function (q, i) {
      const optsEls = document.querySelectorAll("#qq" + i + " .quiz-opt");
      const picked = Array.from(optsEls).findIndex(function (b) { return b.classList.contains("selected"); });
      const feedback = $("qf" + i);
      const correctIdx = q.options.findIndex(function (o) { return o.correct; });
      optsEls.forEach(function (b, bi) {
        b.disabled = true;
        if (bi === correctIdx) b.classList.add("correct");
        else if (bi === picked) b.classList.add("wrong");
      });
      if (picked === correctIdx) { score++; quizState[i].correct = true; feedback.textContent = "✅ Benar!"; feedback.className = "quiz-feedback ok"; }
      else { feedback.textContent = picked === -1 ? "❌ Tidak dijawab. Jawaban benar ditandai hijau." : "❌ Kurang tepat. Jawaban benar ditandai hijau."; feedback.className = "quiz-feedback err"; }
    });
    $("quizScore").textContent = "Skor: " + score + " / " + state.quiz.length;
    toast("Skor kamu: " + score + "/" + state.quiz.length + (score === state.quiz.length ? " — sempurna! 🏆" : ""));
  }

  function regenQuiz() {
    showLoading("Membuat soal baru...");
    buildQuiz().then(function (qs) {
      state.quiz = qs;
      hideLoading();
      renderQuiz();
      toast("Kuis diperbarui", "ok");
    }).catch(function (e) { hideLoading(); toast(e.message, "err"); });
  }

  /* ---------- Chat ---------- */
  function addChatMsg(role, html) {
    const box = $("chatBox");
    const div = document.createElement("div");
    div.className = "chat-msg " + role;
    div.innerHTML = role === "ai" ? "<span>🤖</span><div>" + html + "</div>" : "<span>🧑‍🎓</span><div>" + html + "</div>";
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  async function sendChat() {
    const input = $("chatInput");
    const msg = input.value.trim();
    if (!msg) return;
    input.value = "";
    addChatMsg("user", escapeHtml(msg));

    const typing = addChatMsg("ai", '<span class="typing"><i></i><i></i><i></i></span>');
    let reply;
    try {
      reply = await answerQuestion(state.text, msg);
    } catch (e) {
      reply = "⚠️ Terjadi kesalahan: " + escapeHtml(e.message);
    }
    typing.querySelector("div").innerHTML = reply;
    typing.querySelector("div").style.whiteSpace = "pre-wrap";
    $("chatBox").scrollTop = $("chatBox").scrollHeight;
  }

  function localAnswer(text, question) {
    const sentences = TextUtil.splitSentences(text);
    if (!sentences.length) return "Belum ada materi. Upload dulu ya 👆";
    const qwords = TextUtil.tokenize(question);
    const cwords = qwords.filter(function (w) { return !Stopwords.isStopword(w); });
    const scored = [];
    for (const s of sentences) {
      const words = TextUtil.tokenize(s);
      let hit = 0;
      for (let i = 0; i < cwords.length; i++) {
        if (words.indexOf(cwords[i]) !== -1) hit++;
      }
      if (hit > 0) scored.push({ hit: hit, len: words.length, s: s });
    }
    scored.sort(function (a, b) { return (b.hit / Math.sqrt(b.len || 1)) - (a.hit / Math.sqrt(a.len || 1)); });
    if (scored.length === 0) {
      return "Hmm, aku tidak menemukan jawaban di materimu untuk: <em>" + escapeHtml(question) + "</em>.<br><br>💡 Aktifkan <strong>AI Online</strong> di ⚙️ Pengaturan (gratis) agar aku bisa menjawab pakai model AI. Untuk sekarang, coba pertanyaan yang lebih sederhana atau cek bagian materi lainnya.";
    }
    const top = scored.slice(0, Math.min(3, scored.length));
    let html = "<p>Menurut materimu:</p><ul>";
    top.forEach(function (r) { html += "<li>" + escapeHtml(r.s) + "</li>"; });
    html += "</ul><p style='opacity:.7;font-size:.85em'>💡 Jawaban di atas diambil langsung dari materi (Mode Lokal). Aktifkan AI Online untuk penjelasan yang lebih mendalam.</p>";
    return html;
  }

  async function answerQuestion(text, question) {
    if (aiConfigured) {
      try {
        chatHistory.push({ role: "user", content: question });
        const recent = chatHistory.slice(-10);
        const sys = "Kamu adalah AI Tutor BelajarKuy. Jawab pertanyaan siswa dalam bahasa Indonesia, bersumber dari MATERI yang diberikan. Gunakan analogi bila membantu. Jika materi tidak memuat jawabannya, katakan jujur lalu bantu dengan pengetahuan umum. Jawab dengan jelas, ringkas, dan ramah.";
        const user = "MATERI:\n" + textPreview(state.text) +
          "\n\nRIWAYAT PERCAKAPAN:\n" + recent.map(function (m) { return (m.role === "user" ? "Siswa: " : "AI: ") + m.content; }).join("\n") +
          "\n\nPertanyaan siswa sekarang: " + question;
        const out = await AIService.textComplete(sys, user, { temperature: 0.6 });
        chatHistory.push({ role: "assistant", content: out });
        return escapeHtml(out).replace(/\n/g, "<br>");
      } catch (e) {
        console.warn("AI chat gagal, fallback lokal:", e.message);
      }
    }
    return localAnswer(text, question);
  }

  /* ---------- Tabs ---------- */
  function initTabs() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
        $("panel-" + tab.dataset.tab).classList.add("active");
      });
    });
  }

  /* ---------- New material ---------- */
  function resetMaterial() {
    state.title = "";
    state.text = "";
    state.summary = [];
    state.cards = [];
    state.quiz = [];
    chatHistory.length = 0;
    try { localStorage.removeItem(DOC_KEY); } catch (e) {}
    $("pasteArea").value = "";
    $("ytInput").value = "";
    $("summaryPrompt").value = "";
    const inner = document.querySelector(".card-inner");
    if (inner) inner.classList.remove("flipped");
    renderByState();
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Mulai materi baru ✍️");
  }

  /* ---------- Init ---------- */
  function init() {
    initTheme();
    initUpload();
    initTabs();
    initFlashcardUI();

    document.querySelectorAll("[data-goto]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (el.tagName === "A") e.preventDefault();
        const target = el.getAttribute("data-goto");
        if (target === "home") { showView("home"); } else if (target === "apps") { showView("apps"); }
        else if (target === "features") { showView("home"); document.getElementById("features").scrollIntoView({ behavior: "smooth" }); }
        else if (target === "how") { showView("home"); document.getElementById("how").scrollIntoView({ behavior: "smooth" }); }
        else if (target === "faq") { showView("home"); document.getElementById("faq").scrollIntoView({ behavior: "smooth" }); }
      });
    });

    $("themeToggle").addEventListener("click", function () {
      const cur = document.documentElement.getAttribute("data-theme");
      applyTheme(cur === "dark" ? "light" : "dark");
    });

    $("btnSettings").addEventListener("click", openSettings);
    $("btnCloseSettings").addEventListener("click", function () { $("settingsModal").hidden = true; });
    $("settingsModal").addEventListener("click", function (e) { if (e.target === $("settingsModal")) $("settingsModal").hidden = true; });
    $("aiProvider").addEventListener("change", updateModelPlaceholder);
    $("btnSaveSettings").addEventListener("click", saveSettings);
    $("btnTestKey").addEventListener("click", async function () {
      saveSettings();
      if (!aiConfigured) { showSettingsToast("Tidak ada AI terkonfigurasi.", "err"); return; }
      showSettingsToast("Menghubungi AI...");
      try {
        const r = await AIService.testConnection();
        showSettingsToast("Koneksi OK ✔ Respons: " + r.slice(0, 40));
      } catch (e) {
        showSettingsToast("Gagal: " + e.message, "err");
      }
    });

    $("btnNew").addEventListener("click", resetMaterial);
    $("btnRegenSummary").addEventListener("click", async function () {
      showLoading("Membuat ringkasan baru...");
      try { state.summary = await buildSummary(); renderSummary(); toast("Ringkasan diperbarui", "ok"); }
      catch (e) { toast(e.message, "err"); }
      hideLoading();
    });
    $("btnRegenCards").addEventListener("click", regenCards);
    $("btnRegenQuiz").addEventListener("click", regenQuiz);
    $("btnCopySummary").addEventListener("click", function () {
      if (!state.summary.length) return;
      const txt = state.summary.map(function (s, i) { return (i + 1) + ". " + s; }).join("\n");
      navigator.clipboard.writeText(txt).then(function () { toast("Ringkasan disalin 📋", "ok"); }).catch(function () { toast("Gagal menyalin", "err"); });
    });
    $("btnChatSend").addEventListener("click", sendChat);
    $("chatInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });

    /* restore doc + route */
    if (loadDoc()) {
      showView("apps");
      processDocument();
    } else {
      showView("home");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();