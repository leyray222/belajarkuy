/* Integrasi AI online (Gemini / OpenRouter / OpenAI) dengan fallback ke mode lokal */
window.AIService = (function () {
  const STORE_KEY = "belajarkuy_ai_settings";

  const DEFAULTS = {
    gemini: { model: "gemini-2.0-flash", base: "https://generativelanguage.googleapis.com/v1beta" },
    openrouter: { model: "meta-llama/llama-3.3-70b-instruct", base: "https://openrouter.ai/api/v1" },
    openai: { model: "gpt-4o-mini", base: "https://api.openai.com/v1" }
  };

  function getSettings() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { provider: "", apiKey: "", model: "" };
  }

  function saveSettings(s) {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  }

  function isConfigured(s) {
    s = s || getSettings();
    return !!(s.provider && s.apiKey);
  }

  function modelFor(s) {
    s = s || getSettings();
    if (s.model && s.model.trim()) return s.model.trim();
    return (DEFAULTS[s.provider] || {}).model || "";
  }

  async function textComplete(system, user, opts) {
    opts = opts || {};
    const s = getSettings();
    if (!isConfigured(s)) throw new Error("AI belum dikonfigurasi");

    const model = modelFor(s);
    if (s.provider === "gemini") {
      return geminiComplete(model, system, user, s.apiKey, opts);
    }
    // OpenAI & OpenRouter pakai format chat completions
    const base = (DEFAULTS[s.provider] || {}).base;
    const resp = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.apiKey },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: opts.temperature != null ? opts.temperature : 0.6,
        max_tokens: opts.maxTokens || 4096
      })
    });
    if (!resp.ok) {
      let msg = "HTTP " + resp.status;
      try { const j = await resp.json(); msg = j.error && (j.error.message || j.error).toString(); } catch (e) {}
      throw new Error(msg);
    }
    const data = await resp.json();
    const out = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!out) throw new Error("Respons kosong dari API");
    return out;
  }

  async function geminiComplete(model, system, user, apiKey, opts) {
    const url = DEFAULTS.gemini.base + "/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);
    const body = {
      contents: [{ parts: [{ text: (system || "") + "\n\n" + user }] }],
      generationConfig: {
        temperature: opts.temperature != null ? opts.temperature : 0.6,
        maxOutputTokens: opts.maxTokens || 4096
      }
    };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      let msg = "HTTP " + resp.status;
      try { const j = await resp.json(); msg = (j.error && j.error.message) || msg; } catch (e) {}
      throw new Error(msg);
    }
    const data = await resp.json();
    try {
      return data.candidates[0].content.parts.map(function (p) { return p.text || ""; }).join("");
    } catch (e) {
      throw new Error("Format respons Gemini tidak dikenal. Model \u201c" + model + "\u201d mungkin tidak mendukung API ini (coba gemini-2.0-flash atau gemini-1.5-flash).");
    }
  }

  /* ---- Parsing JSON dengan toleransi (mungkin ada ```json ... ```) ---- */
  function parseJsonStrict(text) {
    const clean = String(text).trim();
    try { return JSON.parse(clean); } catch (e) {}
    const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) { try { return JSON.parse(fence[1].trim()); } catch (e2) {} }
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try { return JSON.parse(clean.slice(start, end + 1)); } catch (e3) {}
    }
    throw new Error("Respons AI bukan JSON yang valid");
  }

  /* Transkripsi audio/video via Gemini (inline base64, gratis untuk file kecil) */
  async function transcribeMedia(arrayBuffer, mime) {
    const s = getSettings();
    if (s.provider !== "gemini" || !s.apiKey) {
      throw new Error("Untuk audio/video dibutuhkan API key Google Gemini (gratis). Aktifkan di Pengaturan AI.");
    }
    const model = modelFor(s) || "gemini-2.0-flash";
    const base64 = arrayBufferToBase64(arrayBuffer);
    const url = DEFAULTS.gemini.base + "/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(s.apiKey);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: mime, data: base64 } },
          { text: "Transkripsikan seluruh audio/video ini menjadi teks. Tulis apa adanya, tanpa komentar tambahan." }
        ] }],
        generationConfig: { temperature: 0.2 }
      })
    });
    if (!resp.ok) {
      let msg = "HTTP " + resp.status;
      try { const j = await resp.json(); msg = (j.error && j.error.message) || msg; } catch (e) {}
      throw new Error(msg);
    }
    const data = await resp.json();
    try {
      return data.candidates[0].content.parts.map(function (p) { return p.text || ""; }).join("");
    } catch (e) {
      throw new Error("Gagal transkripsi: respons tidak berisi teks (file mungkin terlalu besar).");
    }
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  async function testConnection() {
    const out = await textComplete("Kamu adalah asisten. Jawab singkat.", "Balas hanya dengan kata: OK", { maxTokens: 10 });
    return out;
  }

  return {
    getSettings: getSettings,
    saveSettings: saveSettings,
    isConfigured: isConfigured,
    modelFor: modelFor,
    textComplete: textComplete,
    parseJsonStrict: parseJsonStrict,
    transcribeMedia: transcribeMedia,
    testConnection: testConnection
  };
})();
if (typeof globalThis !== "undefined" && window.AIService) globalThis.AIService = window.AIService;