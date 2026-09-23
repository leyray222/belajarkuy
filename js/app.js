/* BelajarKuy — logika aplikasi utama */
(function () {
  "use strict";

  /* ---------- DOM helpers ---------- */
  function $(id) { return document.getElementById(id); }

  /* ---------- State ---------- */
  const DOC_KEY = "belajarkuy_doc";
  const STATS_KEY = "belajarkuy_stats";
  const RATINGS_KEY = "belajarkuy_ratings";
  const WEAK_KEY = "belajarkuy_weak";
  const BANK_KEY = "belajarkuy_bank";
  const state = {
    title: "",
    text: "",
    summary: [],
    cards: [],
    quiz: []
  };
  const chatHistory = [];
  let summaryRaw = [];
  let summaryDensity = 8;

  /* ---------- Stats & SRS helpers ---------- */
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function emptyStats() {
    return { date: todayStr(), sec: 0, rated: 0, correct: 0, attempts: 0 };
  }
  function loadStats() {
    try {
      const s = JSON.parse(localStorage.getItem(STATS_KEY) || "null");
      if (s && s.date === todayStr()) return { date: s.date, sec: s.sec || 0, rated: s.rated || 0, correct: s.correct || 0, attempts: s.attempts || 0 };
    } catch (e) {}
    return emptyStats();
  }
  function saveStats(s) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function getRatings() {
    try { return JSON.parse(localStorage.getItem(RATINGS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveRatings(r) {
    try { localStorage.setItem(RATINGS_KEY, JSON.stringify(r || {})); } catch (e) {}
  }
  function getWeak() {
    try { return JSON.parse(localStorage.getItem(WEAK_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveWeak(w) {
    try { localStorage.setItem(WEAK_KEY, JSON.stringify(w)); } catch (e) {}
  }
  function renderDashStats() {
    const ratings = getRatings();
    let mastered = 0, weak = 0;
    state.cards.forEach(function (c) {
      const r = ratings[c.q] || 0;
      if (r >= 2) mastered++;
      else if (r === 0) weak++;
    });
    $("statMastery").textContent = state.cards.length ? Math.round(mastered / state.cards.length * 100) + "%" : "—";
    $("statWeak").textContent = weak ? weak + " kartu" : "0";
    updateStudyLabel();
  }
  function updateStudyLabel() {
    const m = Math.floor(loadStats().sec / 60);
    $("statStudy").textContent = m >= 60 ? Math.floor(m / 60) + "j " + (m % 60) + "m" : m + " mnt";
  }
  function renderWeak() {
    const w = getWeak();
    const wrap = $("weakWrap");
    if (!w.length || !state.text) { wrap.hidden = true; return; }
    $("weakChips").innerHTML = w.map(function (x) {
      return '<span class="weak-chip">' + escapeHtml(x.q) + "</span>";
    }).join("");
    wrap.hidden = false;
  }
  function fmtTime(totalSec) {
    const m = Math.floor(totalSec / 60), s2 = totalSec % 60;
    return String(m).padStart(2, "0") + ":" + String(s2).padStart(2, "0");
  }

  /* ---------- Bank soal pribadi ---------- */
  let bank = { qs: [] };
  let bankFilter = "all";
  let bankSess = null;
  let bankAnswered = false;

  function loadBank() {
    try {
      const b = JSON.parse(localStorage.getItem(BANK_KEY) || "null");
      if (b && Array.isArray(b.qs)) return { qs: b.qs };
    } catch (e) {}
    return { qs: [] };
  }
  function saveBank() {
    try { localStorage.setItem(BANK_KEY, JSON.stringify(bank)); } catch (e) {}
  }
  function bankCount() { return bank.qs.length; }
  function normBankQ(raw, src) {
    if (!raw || !raw.q || !Array.isArray(raw.options) || raw.options.length < 2) return null;
    const options = raw.options.map(function (o) { return { text: String(o.text || ""), correct: !!o.correct }; });
    if (!options.some(function (o) { return o.correct; })) options[0].correct = true;
    return { q: String(raw.q), options: options, tr: 0, rt: 0, src: src || raw.src || "Manuel" };
  }
  function bankAddNormalized(c) {
    if (!c) return;
    if (bank.qs.some(function (x) { return x.q === c.q; })) return;
    bank.qs.push(c);
    if (bank.qs.length > 600) bank.qs.shift();
    saveBank();
  }
  function bankAddFromQuiz(q, src) {
    const c = normBankQ(q, src || "Dari kuis");
    if (c) { bankAddNormalized(c); renderBankMeta(); }
  }
  function bankQuizFilter() {
    const qs = bank.qs;
    if (bankFilter === "weak") {
      return qs.filter(function (q) { return q.tr > 0 && q.rt / q.tr <= 0.5; });
    }
    return qs.slice();
  }
  function renderBankOne(q) {
    const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const opts = q.options.map(function (o, oi) {
      return '<button class="quiz-opt" data-opt="' + oi + '">' +
        '<span class="opt-let">' + (letters[oi] || (oi + 1)) + "</span>" +
        '<span class="opt-txt">' + escapeHtml(o.text) + "</span></button>";
    }).join("");
    $("bankContent").innerHTML =
      '<div class="quiz-question"><div class="quiz-qn"><span class="num">' + (bankSess.pos + 1) + '</span>' +
      '<span class="quiz-qt">' + escapeHtml(q.q) + "</span></div>" +
      '<div class="quiz-opts">' + opts + "</div>" +
      '<div class="quiz-feedback" id="bf"></div></div>';
    bankAnswered = false;
    $("btnBankNext").hidden = true;
    $("btnBankRestart").hidden = true;
    renderBankMeta();
  }
  function answerBank(oi) {
    if (!bankSess || bankAnswered) return;
    if (!bankSess.pool[bankSess.pos]) return;
    const q = bankSess.pool[bankSess.pos];
    bankAnswered = true;
    q.tr++;
    const correctIdx = q.options.findIndex(function (o) { return o.correct; });
    const els = document.querySelectorAll("#bankContent .quiz-opt");
    els.forEach(function (b, bi) {
      b.disabled = true;
      if (bi === correctIdx) b.classList.add("correct");
      else if (bi === oi) b.classList.add("wrong");
    });
    const fb = $("bf");
    if (oi === correctIdx) {
      q.rt++;
      bankSess.score++;
      fb.textContent = "Benar.";
      fb.className = "quiz-feedback ok";
    } else {
      if (bankSess.missed.indexOf(q.q) === -1) bankSess.missed.push(q.q);
      fb.textContent = "Kurang tepat — jawaban benar ditandai hijau.";
      fb.className = "quiz-feedback err";
    }
    saveBank();
    $("btnBankNext").hidden = false;
    renderBankMeta();
  }
  function startBank() {
    const pool = bankQuizFilter();
    if (!pool.length) {
      bankSess = null;
      $("bankContent").innerHTML = '<div class="empty-hint">Tidak ada soal untuk filter ini.</div>';
      $("btnBankNext").hidden = true;
      $("btnBankRestart").hidden = true;
      renderBankMeta();
      return;
    }
    bankSess = { pool: pool, pos: 0, score: 0, missed: [] };
    renderBankOne(pool[0]);
  }
  function finishBank() {
    const s = bankSess;
    const total = s.pool.length;
    let html = '<div class="quiz-question bank-done"><div class="quiz-qn"><span class="num">√</span>' +
      '<span class="quiz-qt">Latihan selesai</span></div><div class="quiz-feedback ok">Skor: ' + s.score +
      " / " + total + "</div>";
    if (s.missed.length) {
      html += '<p class="muted" style="margin-top:14px">Masih salah ' + s.missed.length + ' soal. Latih lagi yang ini biar tuntas:</p><ul class="chip-list">' +
        s.missed.slice(0, 6).map(function (m) { return "<li>" + escapeHtml(m) + "</li>"; }).join("") +
        "</ul>";
    }
    html += "</div>";
    $("bankContent").innerHTML = html;
    $("btnBankNext").hidden = true;
    $("btnBankRestart").hidden = false;
    renderBankMeta();
  }
  function renderBankMeta() {
    $("bankCount").textContent = bankCount() + " soal";
    $("bankEmpty").hidden = bankCount() > 0;
    $("bankWrap").hidden = bankCount() === 0;
    if (bankSess) {
      $("bankProg").textContent = "pos " + (bankSess.pos + 1) + " / " + bankSess.pool.length;
      $("bankScore").textContent = "Skor " + bankSess.score;
    } else {
      $("bankProg").textContent = "pos —";
      $("bankScore").textContent = "Skor —";
    }
  }

  /* impor/ekspor bank */
  function parseCSV(text) {
    const out = [];
    let cells = [], c = "", q = false;
    function pushCell() { cells.push(c); c = ""; }
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; }
        else c += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") pushCell();
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        pushCell(); out.push(cells.splice(0));
      } else c += ch;
    }
    if (c.length || cells.length) { pushCell(); out.push(cells.splice(0)); }
    return out.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
  }
  function importBankCSV(text) {
    const rows = parseCSV(text);
    let added = 0, cur = null;
    rows.forEach(function (row, ri) {
      if (ri === 0 && /^type$/i.test(String(row[0]).trim())) return;
      const type = String(row[0] || "").trim();
      const title = String(row[1] || "").trim();
      if (title && /multiple_choice/i.test(type)) {
        cur = normBankQ({ q: title, options: row.slice(2, 6).filter(function (x) { return String(x).trim(); }).map(function (t) { return { text: String(t), correct: false }; }) }, "Impor CSV");
        if (cur) { bankAddNormalized(cur); added++; }
      } else if (!title && /MULTIPLE_CHOICE/i.test(type) && cur) {
        for (let k = 0; k < 4; k++) {
          const v = row[2 + k];
          if (v && String(v).trim() && cur.options[k]) cur.options[k].correct = true;
        }
      }
    });
    return added;
  }
  function importBankJSON(text) {
    const d = JSON.parse(text);
    const arr = Array.isArray(d) ? d : (Array.isArray(d.qs) ? d.qs : (Array.isArray(d.quiz) ? d.quiz : null));
    if (!arr) throw new Error("format JSON tidak dikenali.");
    let added = 0;
    arr.forEach(function (raw) {
      const c = normBankQ(raw, "Impor");
      if (c) { bankAddNormalized(c); added++; }
    });
    return added;
  }
  function exportBank(kind) {
    if (!bank.qs.length) { toast("Bank kosong.", "err"); return; }
    if (kind === "json") {
      download("belajarkuy-bank.json", JSON.stringify({ app: "belajarkuy", kind: "bank", v: 2, qs: bank.qs }, null, 2), "application/json");
    } else {
      const rows = [["Type", "Title", "Option 1", "Option 2", "Option 3", "Option 4"].join(",")];
      bank.qs.forEach(function (q) {
        const opts = q.options.map(function (o) { return o.text; });
        rows.push(["MULTIPLE_CHOICE", q.q].concat(opts.slice(0, 4)).map(csvCell).join(","));
        const cIdx = q.options.findIndex(function (o) { return o.correct; });
        if (cIdx >= 0 && cIdx < 4) {
          const mark = ["MULTIPLE_CHOICE", "", "", "", "", ""];
          mark[2 + cIdx] = opts[cIdx];
          rows.push(mark.map(csvCell).join(","));
        }
      });
      download("belajarkuy-bank.csv", "\uFEFF" + rows.join("\r\n"), "text/csv");
    }
    toast("Bank diunduh.", "ok");
  }
  function initBank() {
    document.querySelectorAll("#bankFilter .seg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#bankFilter .seg-btn").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        bankFilter = btn.dataset.f || "all";
        startBank();
      });
    });
    $("bankContent").addEventListener("click", function (e) {
      const b = e.target.closest(".quiz-opt");
      if (!b) return;
      answerBank(parseInt(b.dataset.opt, 10));
    });
    $("btnBankNext").addEventListener("click", function () {
      if (!bankSess) return;
      bankSess.pos++;
      if (bankSess.pos < bankSess.pool.length) renderBankOne(bankSess.pool[bankSess.pos]);
      else finishBank();
    });
    $("btnBankRestart").addEventListener("click", startBank);
    $("btnBankClear").addEventListener("click", function () {
      if (!bank.qs.length) return;
      const ok = typeof confirm === "undefined" ? true : confirm("Hapus semua soal di bank?");
      if (ok) {
        bank.qs = [];
        saveBank();
        startBank();
        toast("Bank dikosongkan.", "ok");
      }
    });
    $("btnBankImport").addEventListener("click", function () { $("bankImportInput").click(); });
    $("bankImportInput").addEventListener("change", function () {
      const f = this.files && this.files[0];
      this.value = "";
      if (!f) return;
      const r = new FileReader();
      r.onload = function () {
        try {
          const isCsv = /\.csv$/i.test(f.name);
          const added = isCsv ? importBankCSV(r.result) : importBankJSON(r.result);
          saveBank();
          startBank();
          toast(added ? added + " soal ditambahkan ke bank." : "Tidak ada soal baru (mungkin duplikat).", "ok");
        } catch (e) {
          toast("Impor bank gagal: " + e.message, "err");
        }
      };
      r.readAsText(f);
    });
    $("btnBankExport").addEventListener("click", function (e) {
      e.stopPropagation();
      const m = $("bankMenu");
      m.hidden = !m.hidden;
    });
    $("bankMenu").addEventListener("click", function (e) {
      e.stopPropagation();
      const b = e.target.closest(".menu-item");
      if (!b) return;
      exportBank(b.dataset.bexp);
      $("bankMenu").hidden = true;
    });
  }

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
    const moon = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
    const sun = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    $("themeToggle").innerHTML = t === "dark" ? sun : moon;
    $("themeToggle").title = t === "dark" ? "Beralih ke tema terang" : "Beralih ke tema gelap";
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
    showSettingsToast("Tersimpan.");
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
          summaryRaw = state.summary.slice();
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
    summaryRaw = [];
    summaryDensity = 8;
    chatHistory.length = 0;
    try { localStorage.removeItem(WEAK_KEY); } catch (e) {}
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
      const msg = "Untuk memproses file audio/video butuh transkripsi. Tambahkan API key Gemini (gratis) di menu Pengaturan, atau gunakan link YouTube, atau tempel transkripnya manual.";
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
    if (!hasAll) toast("Materi berhasil diproses.", "ok");
  }

  async function buildSummary() {
    let out;
    if (aiConfigured) {
      const extra = $("summaryPrompt") ? $("summaryPrompt").value.trim() : "";
      try {
        const sys = "Kamu adalah asisten belajar untuk pelajar Indonesia. Balas HANYA dengan JSON array berisi string, contoh: [\"poin 1\", \"poin 2\"]. Jangan sertakan teks lain.";
        const user = "Buat ringkasan penting materi berikut dalam bahasa Indonesia, 5-12 poin, bahasa sederhana dan mudah dipahami. " +
          (extra ? "Instruksi tambahan: " + extra + ". " : "") +
          "HANYA JSON:\n\nMATERI:\n" + textPreview(state.text);
        const resp = await AIService.textComplete(sys, user, { temperature: 0.4 });
        const arr = AIService.parseJsonStrict(resp);
        out = (Array.isArray(arr) && arr.length >= 2) ? arr.map(function (s) { return String(s); }) : null;
      } catch (e) {
        console.warn("AI summary gagal, fallback lokal:", e.message);
      }
    }
    if (!out) out = Summarizer.summarize(state.text, { maxPoints: 12 });
    summaryRaw = out.slice();
    saveSummaryState();
    return out;
  }

  function saveSummaryState() {
    if (state.summary !== summaryRaw) state.summary = summaryRaw.slice();
    try {
      const raw = localStorage.getItem(DOC_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        d.summary = summaryRaw;
        localStorage.setItem(DOC_KEY, JSON.stringify(d));
      }
    } catch (e) {}
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
    renderDashStats();
    renderWeak();
    renderBankMeta();

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
    const list = displaySummary();
    if (!list.length) {
      c.innerHTML = '<div class="empty-hint">Tekan "Proses materi" dulu ya.</div>';
      return;
    }
    c.innerHTML = list.map(function (s, i) {
      const esc = escapeHtml(s);
      const attr = escapeHtml(s);
      return '<div class="summary-item"><div class="num">' + (i + 1) + '</div><div>' + esc +
        '<button class="ask-btn" type="button" data-q="' + attr + '">jelaskan ini</button></div></div>';
    }).join("");
  }

  function displaySummary() {
    return summaryRaw.slice(0, Math.max(3, summaryDensity));
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- Flashcard engine ---------- */
  let deck = [];
  let deckPos = 0;
  let matched = 0;

  function renderCards() {
    const ratings = getRatings();
    const sortable = state.cards.slice();
    deck = sortable.sort(function (a, b) { return (ratings[a.q] || 0) - (ratings[b.q] || 0); });
    deckPos = 0;
    matched = 0;
    $("cardQ").textContent = deck.length ? deck[0].q : "—";
    $("cardA").textContent = deck.length ? deck[0].a : "—";
    $("cardCount").textContent = deck.length ? "1 / " + deck.length + " · 0 dihafal" : "0 kartu";
    updateCardBar();
    setCardFlipped(false);
    renderDashStats();
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
    updateCardBar();
  }

  function rateCard(rate) {
    if (!deck.length) return;
    const c = currentCard();
    const ratings = getRatings();
    const key = c.q;
    const prev = ratings[key] || 0;
    if (rate === 2) {
      ratings[key] = Math.min(prev + 1, 5);
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
    saveRatings(ratings);
    const st = loadStats();
    st.rated++;
    saveStats(st);
    if (deck.length) {
      const c2 = currentCard();
      $("cardQ").textContent = c2.q;
      $("cardA").textContent = c2.a;
      updateCardCount();
    }
    setCardFlipped(false);
    renderDashStats();
  }

  function finishDeck() {
    const ratings = getRatings();
    const sortable = state.cards.slice();
    deck = sortable.sort(function (a, b) { return (ratings[a.q] || 0) - (ratings[b.q] || 0); });
    matched = 0;
    deckPos = 0;
    $("cardQ").textContent = deck[0].q;
    $("cardA").textContent = deck[0].a;
    toast("Semua kartu dihafal — deck diulang untuk penguatan.", "ok");
    updateCardCount();
    renderDashStats();
  }

  function updateCardBar() {
    const el = $("cardBarFill");
    if (el) el.style.width = deck.length ? (((deckPos + 1) / deck.length) * 100) + "%" : "0%";
  }

  /* keyboard: spasi=balik, panah=pindah, 1/2/3=nilai */
  function initKeyboard() {
    document.addEventListener("keydown", function (e) {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (!$("settingsModal").hidden) return;
      if ($("state-dashboard").hidden) return;
      if (!deck.length) return;
      if (e.key === " ") { e.preventDefault(); flipCard(); }
      else if (e.key === "ArrowLeft") goCard(-1);
      else if (e.key === "ArrowRight") goCard(1);
      else if (e.key === "1") rateCard(0);
      else if (e.key === "2") rateCard(1);
      else if (e.key === "3") rateCard(2);
    });
  }

  function flipCard() {
    if (!deck.length) return;
    const inner = document.querySelector(".card-inner");
    if (inner) inner.classList.toggle("flipped");
  }

  /* Kepadatan ringkasan (lokal, instan) */
  function initDensity() {
    document.querySelectorAll("#density .seg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#density .seg-btn").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        summaryDensity = parseInt(btn.dataset.d, 10) || 8;
        renderSummary();
      });
    });
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
    $("btnTryout").hidden = false;
    $("btnRegenQuiz").hidden = false;
    quizState = state.quiz.map(function (q) { return { answered: false, correct: false }; });
    $("quizScore").textContent = "";
    const c = $("quizContent");
    c.innerHTML = state.quiz.map(function (q, i) {
      const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
      const optsHtml = q.options.map(function (o, oi) {
        return '<button class="quiz-opt" data-q="' + i + '" data-opt="' + oi + '">' +
          '<span class="opt-let">' + (letters[oi] || (oi + 1)) + "</span>" +
          '<span class="opt-txt">' + escapeHtml(o.text) + "</span></button>";
      }).join("");
      return '<div class="quiz-question" id="qq' + i + '">' +
        '<div class="quiz-qn"><span class="num">' + (i + 1) + "</span>" +
        '<span class="quiz-qt">' + escapeHtml(q.q) + "</span></div>" +
        '<div class="quiz-opts">' + optsHtml + "</div>" +
        '<div class="quiz-feedback" id="qf' + i + '"></div>' +
        "</div>";
    }).join("") +
      '<div class="quiz-actions"><button class="btn btn-solid" id="btnQuizSubmit">Periksa jawaban →</button></div>';
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
    const wrong = [];
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
      if (picked === correctIdx) { score++; quizState[i].correct = true; feedback.textContent = "Benar."; feedback.className = "quiz-feedback ok"; }
      else {
        feedback.textContent = picked === -1 ? "Tidak dijawab — jawaban benar ditandai hijau." : "Kurang tepat — jawaban benar ditandai hijau.";
        feedback.className = "quiz-feedback err";
        wrong.push(q.q);
        bankAddFromQuiz(q);
      }
    });
    $("quizScore").textContent = "Skor: " + score + " / " + state.quiz.length;
    const st = loadStats();
    st.attempts += state.quiz.length;
    st.correct += score;
    saveStats(st);
    if (wrong.length) {
      const w = getWeak();
      wrong.forEach(function (q) {
        if (!w.some(function (x) { return x.q === q; })) w.push({ q: q });
      });
      if (w.length > 8) w.splice(0, w.length - 8);
      saveWeak(w);
      renderWeak();
    }
    renderDashStats();
    toast("Skor kamu: " + score + "/" + state.quiz.length + (score === state.quiz.length ? " — skor sempurna." : ""));
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

  /* ---------- Tryout / Mode Ujian ---------- */
  let exam = null;
  let examTimerId = null;
  let examPace = 35;
  const EXAM_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

  function shuffleArr(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function shortTxt(s, n) {
    s = String(s);
    return s.length > (n || 90) ? s.slice(0, (n || 90)) + "…" : s;
  }
  function examSetup() {
    $("btnTryout").hidden = true;
    $("btnRegenQuiz").hidden = true;
    $("quizScore").textContent = "";
    $("quizContent").innerHTML =
      '<div class="exam-setup"><div class="quiz-qn"><span class="num">UA</span><span class="quiz-qt">Mode Ujian</span></div>' +
      '<p class="muted">' + state.quiz.length + " soal, dikerjakan satu per satu tanpa koreksi langsung. Nilai muncul setelah kamu kumpulkan.</p>" +
      '<div class="seg" id="examPace">' +
      '<button class="seg-btn" data-p="20">Cepat · 20 dtk</button>' +
      '<button class="seg-btn active" data-p="35">Standar · 35 dtk</button>' +
      '<button class="seg-btn" data-p="60">Santai · 60 dtk</button></div>' +
      '<p class="muted" id="examSub">Durasi: ' + Math.max(1, Math.ceil(examPace * state.quiz.length / 60)) + " menit</p>" +
      '<div class="quiz-actions">' +
      '<button class="btn btn-solid" id="btnExamStart">Mulai ujian →</button>' +
      '<button class="btn btn-line" id="btnExamBack">← Latihan</button></div></div>';
    let paceFired = false;
    document.querySelectorAll("#examPace .seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        examPace = parseInt(b.dataset.p, 10);
        document.querySelectorAll("#examPace .seg-btn").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        $("examSub").textContent = "Durasi: " + Math.max(1, Math.ceil(examPace * state.quiz.length / 60)) + " menit";
      });
    });
    $("btnExamStart").addEventListener("click", beginExam);
    $("btnExamBack").addEventListener("click", renderQuiz);
  }
  function beginExam() {
    const n = state.quiz.length;
    exam = {
      n: n,
      order: shuffleArr(state.quiz.map(function (_, i) { return i; })),
      answers: new Array(n),
      marks: new Array(n).fill(false),
      pos: 0,
      remaining: Math.ceil(n * examPace),
      elapsed: 0,
      auto: false
    };
    renderExam();
    examTimerId = setInterval(tickExam, 1000);
  }
  function renderExam() {
    const s = exam;
    $("quizScore").textContent = "";
    $("quizContent").innerHTML =
      '<div class="exam-bar">' +
      '<span class="stat-chip">Soal ' + (s.pos + 1) + " / " + s.n + "</span>" +
      '<span class="stat-chip exam-timer" id="examTimer">' + fmtTime(s.remaining) + "</span>" +
      '<span class="stat-chip exam-mark">' + (s.marks[s.pos] ? "● Ditandai" : "○ Belum") + "</span>" +
      '<button class="btn btn-line btn-sm" id="btnExamMark">Tandai</button>' +
      '<button class="btn btn-line btn-sm" id="btnExamExit">Keluar</button></div>' +
      '<div class="quiz-content" style="padding:0">' + renderExamQ(s.pos) + "</div>" +
      '<div class="quiz-actions">' +
      (s.pos > 0 ? '<button class="btn btn-line" id="btnExamPrev">← Sebelumnya</button>' : "") +
      (s.pos < s.n - 1 ? '<button class="btn btn-solid" id="btnExamNext">Berikutnya →</button>' : '<button class="btn btn-solid" id="btnExamSubmit">Kumpulkan ujian</button>') +
      '<button class="btn btn-line alert" id="btnExamSubmitAll">Kumpulkan</button>' +
      "</div>";
    document.querySelectorAll("#quizContent .quiz-opt").forEach(function (b) {
      b.addEventListener("click", function () {
        const oi = parseInt(b.dataset.opt, 10);
        if (typeof exam.answers[exam.pos] === "number") {
          document.querySelectorAll("#quizContent .quiz-opt").forEach(function (x) { x.classList.remove("selected"); });
        }
        document.querySelectorAll("#quizContent .quiz-opt").forEach(function (x) { x.classList.remove("selected"); });
        b.classList.add("selected");
        exam.answers[exam.pos] = oi;
      });
    });
    $("btnExamMark").addEventListener("click", toggleMark);
    $("btnExamExit").addEventListener("click", cancelExam);
    const prev = $("btnExamPrev");
    if (prev) prev.addEventListener("click", function () { exam.pos--; renderExam(); });
    const next = $("btnExamNext");
    if (next) next.addEventListener("click", function () { exam.pos++; renderExam(); });
    const sub = $("btnExamSubmit");
    if (sub) sub.addEventListener("click", function () { submitExam(); });
    $("btnExamSubmitAll").addEventListener("click", submitExam);
  }
  function renderExamQ(i) {
    const q = state.quiz[exam.order[i]];
    const opts = q.options.map(function (o, oi) {
      return '<button class="quiz-opt' + (exam.answers[i] === oi ? " selected" : "") + '" data-opt="' + oi + '">' +
        '<span class="opt-let">' + (EXAM_LETTERS[oi] || (oi + 1)) + "</span>" +
        '<span class="opt-txt">' + escapeHtml(o.text) + "</span></button>";
    }).join("");
    return '<div class="quiz-question">' +
      '<div class="quiz-qn"><span class="num">' + (i + 1) + "</span>" +
      '<span class="quiz-qt">' + escapeHtml(q.q) + "</span></div>" +
      '<div class="quiz-opts">' + opts + "</div></div>";
  }
  function toggleMark() {
    if (!exam) return;
    exam.marks[exam.pos] = !exam.marks[exam.pos];
    renderExam();
  }
  function tickExam() {
    if (!exam) return;
    exam.remaining--;
    exam.elapsed++;
    const t = $("examTimer");
    if (t) {
      t.textContent = fmtTime(exam.remaining);
      t.classList.toggle("urgent", exam.remaining <= 60);
    }
    if (exam.remaining <= 0) { exam.auto = true; submitExam(true); }
  }
  function submitExam(silent) {
    if (!exam) return;
    const unanswered = exam.answers.filter(function (a) { return typeof a !== "number"; }).length;
    if (unanswered) {
      const abort = typeof confirm === "undefined" ? false : !confirm("Masih " + unanswered + " soal belum dijawab. Kumpulkan sekarang?");
      if (abort) return;
    }
    clearInterval(examTimerId);
    examTimerId = null;
    const s = exam;
    let score = 0;
    const wrong = [];
    for (let i = 0; i < s.n; i++) {
      const q = state.quiz[s.order[i]];
      const correctIdx = q.options.findIndex(function (o) { return o.correct; });
      if (s.answers[i] === correctIdx) score++;
      else wrong.push(q);
    }
    const st = loadStats();
    st.attempts += s.n;
    st.correct += score;
    saveStats(st);
    if (wrong.length) {
      wrong.forEach(function (q) {
        const w = getWeak();
        if (!w.some(function (x) { return x.q === q.q; })) w.push({ q: q.q });
        if (w.length > 8) w.splice(0, w.length - 8);
        saveWeak(w);
        bankAddFromQuiz(q, "Salah di tryout");
      });
      renderWeak();
    }
    renderDashStats();
    renderExamResult(score, wrong);
    toast("Tryout: " + score + "/" + s.n + (score === s.n ? " — sempurna!" : ""));
  }
  function renderExamResult(score, wrong) {
    const s = exam;
    const n = s.n;
    const pct = Math.round((score / n) * 100);
    let status = "Kamu lancar di materi ini. Pertahankan!";
    if (pct >= 90) status = "Luar biasa — kamu menguasai materi ini.";
    else if (pct < 70) status = "Masih perlu diulang. Kerjakan yang salah di Bank Soal, lalu coba lagi.";
    const letters = EXAM_LETTERS;
    const review = [];
    for (let i = 0; i < n; i++) {
      const q = state.quiz[s.order[i]];
      const correctIdx = q.options.findIndex(function (o) { return o.correct; });
      const picked = s.answers[i];
      const ok = picked === correctIdx;
      review.push('<div class="rev ' + (ok ? "rev-ok" : "rev-err") + '"><b>' + (i + 1) + "</b> " +
        escapeHtml(shortTxt(q.q)) +
        '<br><span class="rev-det">Jawabanmu: <strong>' + (typeof picked === "number" ? letters[picked] + ". " + escapeHtml(shortTxt((q.options[picked] || {}).text, 60)) : "— tidak dijawab") +
        "</strong> · Benar: <strong>" + letters[correctIdx] + ". " + escapeHtml(shortTxt(q.options[correctIdx].text, 60)) + "</strong></span></div>");
    }
    $("btnTryout").hidden = false;
    $("btnRegenQuiz").hidden = false;
    $("quizContent").innerHTML =
      '<div class="exam-result">' +
      '<div class="quiz-qn"><span class="num">' + score + "</span>" +
      '<span class="quiz-qt">Skor ' + score + " dari " + n + " · " + pct + "%</span></div>" +
      '<div class="quiz-feedback ' + (pct >= 70 ? "ok" : "err") + '">' + status + "</div>" +
      '<p class="muted">Waktu: ' + fmtTime(s.elapsed) + (s.auto ? " · <span style=\"color:var(--err)\">waktu habis, dikumpulkan otomatis</span>" : "") + "</p>" +
      '<div class="rev-list">' + review.join("") + "</div>" +
      '<div class="quiz-actions">' +
      '<button class="btn btn-solid" id="btnTryRetry">Ulang ujian ↻</button>' +
      '<button class="btn btn-line" id="btnTryBank">Latih yang salah → Bank</button>' +
      '<button class="btn btn-line" id="btnTrySave">Unduh hasil ▾</button>' +
      '<button class="btn btn-line" id="btnTryBack">← Latihan</button></div></div>';
    $("btnTryRetry").addEventListener("click", beginExam);
    $("btnTryBank").addEventListener("click", function () {
      exam = null;
      switchTab("bank");
      bankFilter = "weak";
      document.querySelectorAll("#bankFilter .seg-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.f === "weak"); });
      startBank();
    });
    $("btnTrySave").addEventListener("click", function () {
      download("belajarkuy-hasil-tryout.json", JSON.stringify({
        app: "belajarkuy", kind: "tryout", materi: state.title, waktu: s.elapsed, score: score, total: n,
        soal: review.map(function (r, i) { return r; })
      }, null, 2), "application/json");
    });
    $("btnTryBack").addEventListener("click", function () { exam = null; renderQuiz(); });
  }
  function cancelExam() {
    if (!exam) return;
    const ok = typeof confirm === "undefined" ? true : confirm("Hentikan ujian? Jawaban yang sudah diisi tidak akan dinilai.");
    if (ok) {
      clearInterval(examTimerId);
      examTimerId = null;
      exam = null;
      renderQuiz();
      toast("Tryout dibatalkan.", "ok");
    }
  }
  function initTryout() {
    $("btnTryout").addEventListener("click", function () {
      if (!state.quiz.length) { toast("Buat soal dulu — upload materi lalu buka tab Kuis.", "err"); return; }
      examSetup();
    });
  }

  /* ---------- Lapor Bug / Saran ---------- */
  let reportType = "Bug";
  function reportMeta() {
    const counts = [
      "Materi: " + (state.title || "—"),
      "Kata: " + (state.text ? TextUtil.countWords(state.text) : "—"),
      "Ringkasan: " + (state.summary ? state.summary.length : "—") + " poin",
      "Kartu: " + (state.cards ? state.cards.length : "—"),
      "Soal: " + (state.quiz ? state.quiz.length : "—"),
      "Bank soal: " + bank.qs.length
    ];
    let ai = "Lokal";
    try {
      const s = AIService.load();
      if (s && s.provider) ai = s.provider;
      else if (aiConfigured) ai = "AI Online";
    } catch (e) {}
    return [
      "Versi: belajarkuy 1.0",
      "Waktu: " + new Date().toLocaleString("id-ID"),
      "Halaman: " + (typeof location !== "undefined" ? location.href : "—"),
      "Browser: " + (navigator.userAgent || "—"),
      "Mode: " + ai,
      "Penyimpanan: doc " + ((localStorage.getItem("belajarkuy_doc") || "").length) + " B · stats " + ((localStorage.getItem("belajarkuy_stats") || "").length) + " B"
    ].concat(counts);
  }
  function buildReport() {
    const msg = $("reportMsg").value.trim();
    return {
      app: "belajarkuy",
      jenis: reportType,
      pesan: msg,
      langkah: $("reportSteps").value.trim() || "",
      kontak: $("reportContact").value.trim() || "",
      meta: reportMeta()
    };
  }
  function reportText(r) {
    return "LAPORAN BELAJARKUY\n=================\nJenis: " + r.jenis + "\nPesan: " + r.pesan +
      (r.langkah ? "\nLangkah: " + r.langkah : "") +
      (r.kontak ? "\nKontak: " + r.kontak : "") +
      "\n\nInfo teknis:\n" + r.meta.map(function (m) { return "· " + m; }).join("\n") + "\n";
  }
  function uploadReport() {
    const msg = $("reportMsg").value.trim();
    if (msg.length < 10) { toast("Tulis dulu apa yang terjadi (min. 10 karakter).", "err"); return false; }
    const r = buildReport();
    const title = reportType + ": " + msg.slice(0, 60);
    const body = reportText(r);
    const url = "https://github.com/leyray222/belajarkuy/issues/new?title=" +
      encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
    if (typeof window !== "undefined" && window.open) window.open(url, "_blank", "noopener");
    return true;
  }
  function initReport() {
    document.querySelectorAll("#reportType .seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll("#reportType .seg-btn").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        reportType = b.dataset.t;
      });
    });
    $("btnReport").addEventListener("click", function () {
      $("reportMsg").value = "";
      $("reportSteps").value = "";
      $("reportContact").value = "";
      $("reportToast").hidden = true;
      $("reportMeta").textContent = reportMeta().join("\n");
      $("reportModal").hidden = false;
    });
    $("btnCloseReport").addEventListener("click", function () { $("reportModal").hidden = true; });
    $("reportModal").addEventListener("click", function (e) { if (e.target === $("reportModal")) $("reportModal").hidden = true; });
    $("btnReportIssue").addEventListener("click", function () {
      if (!uploadReport()) return;
      $("reportModal").hidden = true;
      toast("Halaman GitHub Issues dibuka — tinggal klik 'Submit new issue'.", "ok");
    });
    $("btnReportCopy").addEventListener("click", function () {
      const msg = $("reportMsg").value.trim();
      if (msg.length < 10) { toast("Tulis dulu apa yang terjadi.", "err"); return; }
      const text = reportText(buildReport());
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("Laporan tersalin — tempel ke mana saja.", "ok"); });
      } else {
        toast("Klipbor tidak tersedia di browser ini. Coba 'Unduh .json'.", "err");
      }
    });
    $("btnReportSave").addEventListener("click", function () {
      const msg = $("reportMsg").value.trim();
      if (msg.length < 10) { toast("Tulis dulu apa yang terjadi.", "err"); return; }
      download("laporan-bug-" + Date.now() + ".json", JSON.stringify(buildReport(), null, 2), "application/json");
      toast("Laporan diunduh.", "ok");
    });
  }

  /* ---------- Chat ---------- */
  function addChatMsg(role, html) {
    const box = $("chatBox");
    const div = document.createElement("div");
    div.className = "chat-msg " + role;
    div.innerHTML = role === "ai"
      ? '<span class="chat-ava">KY</span><div>' + html + "</div>"
      : '<span class="chat-ava">MU</span><div>' + html + "</div>";
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
      reply = "Terjadi kesalahan: " + escapeHtml(e.message);
    }
    typing.querySelector("div").innerHTML = reply;
    typing.querySelector("div").style.whiteSpace = "pre-wrap";
    $("chatBox").scrollTop = $("chatBox").scrollHeight;
  }

  function localAnswer(text, question) {
    const sentences = TextUtil.splitSentences(text);
    if (!sentences.length) return "Belum ada materi. Upload dulu ya.";
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
      return "Hmm, aku tidak menemukan jawaban di materimu untuk: <em>" + escapeHtml(question) + "</em>.<br><br>Saran: aktifkan <strong>AI Online</strong> di menu Pengaturan (gratis) agar aku bisa menjawab pakai model AI. Untuk sekarang, coba pertanyaan yang lebih sederhana atau telusuri bagian materi lainnya.";
    }
    const top = scored.slice(0, Math.min(3, scored.length));
    let html = "<p>Menurut materimu:</p><ul>";
    top.forEach(function (r) { html += "<li>" + escapeHtml(r.s) + "</li>"; });
    html += "</ul><p style='opacity:.7;font-size:.85em'>Catatan: jawaban di atas diambil langsung dari materi (Mode Lokal). Aktifkan AI Online untuk penjelasan yang lebih dalam.</p>";
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
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("active", t.dataset.tab === name); });
    document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.id === "panel-" + name); });
  }
  function initTabs() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () { switchTab(tab.dataset.tab); });
    });
  }

  /* ---------- New material ---------- */
  function resetMaterial() {
    if (exam) {
      clearInterval(examTimerId);
      examTimerId = null;
      exam = null;
    }
    state.title = "";
    state.text = "";
    state.summary = [];
    state.cards = [];
    state.quiz = [];
    summaryRaw = [];
    summaryDensity = 8;
    document.querySelectorAll("#density .seg-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.d === "8");
    });
    chatHistory.length = 0;
    try { localStorage.removeItem(DOC_KEY); } catch (e) {}
    try { localStorage.removeItem(WEAK_KEY); } catch (e) {}
    $("pasteArea").value = "";
    $("ytInput").value = "";
    $("summaryPrompt").value = "";
    const inner = document.querySelector(".card-inner");
    if (inner) inner.classList.remove("flipped");
    renderByState();
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Mulai materi baru.");
  }

  /* ---------- Scroll reveal ---------- */
  function initReveal() {
    let seq = 0;
    document.querySelectorAll(".index-row, .step, .quote, .faq-item").forEach(function (el, i) {
      el.style.setProperty("--i", (seq++) % 6);
    });
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".rv").forEach(function (el) { el.classList.add("in"); });
      return;
    }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".rv").forEach(function (el) { io.observe(el); });
  }

  /* ---------- Stat counters ---------- */
  function initCounters() {
    document.querySelectorAll(".countup").forEach(function (el) {
      const to = parseFloat(el.dataset.to || "0");
      const isInt = Number.isInteger(to);
      if (!("IntersectionObserver" in window)) { el.textContent = to; return; }
      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          const dur = 850, t0 = performance.now();
          function tick(now) {
            const p = Math.min(1, (now - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = isInt ? Math.round(to * eased) : (to * eased).toFixed(1);
            if (p < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
      }, { threshold: 0.6 });
      io.observe(el);
    });
  }

  /* ---------- Export / import ---------- */
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 250);
  }
  function slug() {
    return (state.title || "materi").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "materi";
  }
  function csvCell(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
  function exportDoc(kind) {
    if (!state.text) { toast("Proses materi dulu ya.", "err"); return; }
    if (kind === "json") {
      download("belajarkuy-" + slug() + ".json", JSON.stringify({ app: "belajarkuy", v: 2, title: state.title, text: state.text, summary: displaySummary(), cards: state.cards, quiz: state.quiz }, null, 2), "application/json");
    } else if (kind === "md") {
      const lines = ["# " + (state.title || "Materi"), "", "## Ringkasan"];
      displaySummary().forEach(function (s) { lines.push("- " + s); });
      lines.push("", "## Flashcard");
      state.cards.forEach(function (c) { lines.push("- **" + c.q + "** — " + c.a); });
      lines.push("", "## Kuis (kunci jawaban)");
      state.quiz.forEach(function (q, i) {
        const key = q.options.find(function (o) { return o.correct; });
        lines.push((i + 1) + ". " + q.q + " -> " + (key ? key.text : "?"));
      });
      download("belajarkuy-" + slug() + ".md", lines.join("\n"), "text/markdown");
    } else if (kind === "flash") {
      const rows = [csvCell("Pertanyaan") + "," + csvCell("Jawaban")];
      state.cards.forEach(function (c) { rows.push(csvCell(c.q) + "," + csvCell(c.a)); });
      download("belajarkuy-flashcard-" + slug() + ".csv", "\uFEFF" + rows.join("\r\n"), "text/csv");
    } else if (kind === "quiz") {
      const head = ["Type", "Title", "Option 1", "Option 2", "Option 3", "Option 4"];
      const rows = [head.join(",")];
      state.quiz.forEach(function (q) {
        const opts = q.options.map(function (o) { return o.text; });
        rows.push(["MULTIPLE_CHOICE", q.q].concat(opts.slice(0, 4)).map(csvCell).join(","));
        const cIdx = q.options.findIndex(function (o) { return o.correct; });
        if (cIdx >= 0 && cIdx < 4) {
          const mark = ["MULTIPLE_CHOICE", "", "", "", "", ""];
          mark[2 + cIdx] = opts[cIdx];
          rows.push(mark.map(csvCell).join(","));
        }
      });
      download("belajarkuy-kuis-" + slug() + ".csv", "\uFEFF" + rows.join("\r\n"), "text/csv");
    }
    toast("File diunduh.", "ok");
  }
  function initExportMenu() {
    const menu = $("exportMenu");
    $("btnExportMenu").addEventListener("click", function (e) {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener("click", function () { menu.hidden = true; });
    menu.addEventListener("click", function (e) {
      e.stopPropagation();
      const b = e.target.closest(".menu-item");
      if (!b) return;
      exportDoc(b.dataset.export);
      menu.hidden = true;
    });
  }
  function initImport() {
    $("btnImport").addEventListener("click", function () { $("importInput").click(); });
    $("importInput").addEventListener("change", function () {
      const f = this.files && this.files[0];
      this.value = "";
      if (!f) return;
      const r = new FileReader();
      r.onload = function () {
        try {
          const d = JSON.parse(r.result);
          if (!d || !d.text || d.text.length < 20) throw new Error("file tidak valid.");
          state.title = d.title || "Impor: " + f.name;
          state.text = d.text;
          state.summary = Array.isArray(d.summary) ? d.summary : [];
          summaryRaw = state.summary.slice();
          state.cards = Array.isArray(d.cards) ? d.cards : [];
          state.quiz = Array.isArray(d.quiz) ? d.quiz : [];
          chatHistory.length = 0;
          summaryDensity = 8;
          try { localStorage.removeItem(WEAK_KEY); } catch (e) {}
          saveDoc();
          renderByState();
          showView("apps");
          if (!state.summary.length || !state.cards.length || !state.quiz.length) processDocument();
          else renderCards();
          toast("Materi diimpor.", "ok");
        } catch (e) {
          toast("Impor gagal: " + e.message, "err");
        }
      };
      r.readAsText(f);
    });
  }

  /* ---------- Bagikan via link ---------- */
  function initShare() {
    $("btnShare").addEventListener("click", function () {
      if (!state.text) { toast("Proses materi dulu ya.", "err"); return; }
      try {
        const b = new Blob([state.text], { type: "text/plain" });
        const fr = new FileReader();
        fr.onloadend = function () {
          let b64 = String(fr.result).split(",")[1];
          b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          const url = location.origin + location.pathname + "#m=" + b64;
          navigator.clipboard.writeText(url).then(function () {
            toast("Link materi disalin — kirim ke teman.", "ok");
          }).catch(function () {
            toast(url.slice(0, 60) + "... (salin manual)", "err");
          });
        };
        fr.readAsDataURL(b);
      } catch (e) {
        toast("Bagikan gagal: " + e.message, "err");
      }
    });
  }
  function handleSharedHash() {
    if (typeof location === "undefined") return;
    const h = location.hash || "";
    if (h.indexOf("#m=") !== 0) return;
    try {
      let b64 = h.slice(3).replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      let txt = window.atob ? decodeURIComponent(escape(window.atob(b64))) : b64;
      if (!txt || txt.length < 20) return;
      newMaterial("Materi dibagikan", TextUtil.clean(txt));
      processDocument();
      showView("apps");
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {}
  }

  /* ---------- Pomodoro ---------- */
  let pomo = { mode: "focus", left: 25 * 60, run: false, iv: null, tick: 0 };
  function renderPomo() {
    const el = $("pomoTime");
    el.textContent = fmtTime(pomo.left);
    el.className = pomo.mode === "break" ? "pomo-break" : "";
  }
  function pomoTick() {
    if (!pomo.run) return;
    pomo.left--;
    if (pomo.mode === "focus") {
      const st = loadStats();
      st.sec++;
      saveStats(st);
      updateStudyLabel();
    }
    if (pomo.left <= 0) {
      if (pomo.mode === "focus") {
        pomo.mode = "break";
        pomo.left = 5 * 60;
        toast("Sesi fokus 25 menit selesai — istirahat 5 menit.", "ok");
      } else {
        pomo.mode = "focus";
        pomo.left = 25 * 60;
        toast("Istirahat selesai — lanjut fokus 25 menit.", "ok");
      }
    }
    renderPomo();
  }
  function initPomodoro() {
    $("pomoStart").addEventListener("click", function () {
      if (!state.text) { toast("Proses materi dulu ya.", "err"); return; }
      pomo.run = !pomo.run;
      if (pomo.run) {
        if (!pomo.iv) pomo.iv = setInterval(pomoTick, 1000);
        toast("Pomodoro dimulai — fokus 25 menit.");
      } else {
        clearInterval(pomo.iv);
        pomo.iv = null;
        toast("Timer dijeda.", "ok");
      }
    });
    $("pomoReset").addEventListener("click", function () {
      clearInterval(pomo.iv);
      pomo.iv = null;
      pomo.run = false;
      pomo.mode = "focus";
      pomo.left = 25 * 60;
      renderPomo();
      toast("Timer direset.");
    });
if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("beforeunload", function () {
        clearInterval(pomo.iv);
        saveStats(loadStats());
      });
    }
  }

  /* ---------- Cetak flashcard ---------- */
  function initPrint() {
    $("btnPrintCards").addEventListener("click", function () {
      if (!state.cards.length) { toast("Belum ada flashcard.", "err"); return; }
      const area = $("printArea");
      area.innerHTML = '<div class="print-head"><strong>' + escapeHtml(state.title || "Flashcard") +
        "</strong><span>BelajarKuy · by Panji Yusuf</span></div>" +
        state.cards.map(function (c, i) {
          return '<div class="print-card"><div class="pc-q"><span class="pc-no">' + (i + 1) +
            "</span><p>" + escapeHtml(c.q) + '</p></div><div class="pc-a">' + escapeHtml(c.a) + "</div></div>";
        }).join("");
      setTimeout(function () { window.print(); }, 80);
    });
  }

  /* ---------- Tanya per poin ringkasan / ke tab ---------- */
  function activateTab(name) {
    const tab = document.querySelector('.tab[data-tab="' + name + '"]');
    if (tab) tab.click();
  }
  function initAsk() {
    document.addEventListener("click", function (e) {
      const b = e.target.closest(".ask-btn");
      if (b) {
        $("chatInput").value = b.getAttribute("data-q") || "";
        activateTab("chat");
        $("chatInput").focus();
        return;
      }
      const g = e.target.closest(".weak-goto");
      if (g && g.getAttribute("data-goto") === "flashcards") activateTab("flashcards");
    });
  }

  /* ---------- PWA offline ---------- */
  function initPWA() {
    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  /* ---------- Init ---------- */
  function init() {
    bank = loadBank();
    initTheme();
    initReveal();
    initCounters();
    initUpload();
    initTabs();
    initFlashcardUI();
    initDensity();
    initKeyboard();
    initExportMenu();
    initImport();
    initShare();
    initPomodoro();
    initPrint();
    initAsk();
    initTryout();
    initReport();
    initBank();
    initPWA();

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
        showSettingsToast("Koneksi OK. Respons: " + r.slice(0, 40));
      } catch (e) {
        showSettingsToast("Gagal: " + e.message, "err");
      }
    });

    $("btnNew").addEventListener("click", resetMaterial);
$("btnRegenSummary").addEventListener("click", async function () {
      showLoading("Membuat ringkasan baru...");
      try { state.summary = await buildSummary(); renderSummary(); toast("Ringkasan diperbarui.", "ok"); }
      catch (e) { toast(e.message, "err"); }
      hideLoading();
    });
    $("btnCopySummary").addEventListener("click", function () {
      const list = displaySummary();
      if (!list.length) return;
      const txt = list.map(function (s, i) { return (i + 1) + ". " + s; }).join("\n");
      navigator.clipboard.writeText(txt).then(function () { toast("Ringkasan disalin.", "ok"); }).catch(function () { toast("Gagal menyalin.", "err"); });
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
    handleSharedHash();
  }

  document.addEventListener("DOMContentLoaded", init);
})();