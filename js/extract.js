/* Ekstraksi teks dari berbagai format: TXT/MD, PDF, DOCX, PPTX, XLSX, YouTube */
window.Extractor = (function () {
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.__libs && window.__libs[src]) { resolve(); return; }
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { window.__libs = window.__libs || {}; window.__libs[src] = true; resolve(); };
      s.onerror = function () { reject(new Error("Gagal memuat pustaka: " + src)); };
      document.head.appendChild(s);
    });
  }

  function readTextFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(new Error("Gagal membaca file")); };
      r.readAsText(file, "utf-8");
    });
  }

  function readArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error("Gagal membaca file")); };
      r.readAsArrayBuffer(file);
    });
  }

  const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const MAMMOTH_CDN = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
  const JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

  async function readPdf(file) {
    await loadScript(PDFJS_CDN);
    const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
    if (!pdfjsLib) throw new Error("Pustaka PDF gagal dimuat.");
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN.replace("pdf.min.js", "pdf.worker.min.js");
    const buf = await readArrayBuffer(file);
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        if (item.str !== undefined) line += item.str + " ";
        if (item.hasEOL) { text += line.trim() + "\n"; line = ""; }
      }
      text += line.trim() + "\n";
    }
    return TextUtil.clean(text);
  }

  async function readDocx(file) {
    await loadScript(MAMMOTH_CDN);
    if (!window.mammoth) throw new Error("Pustaka DOCX gagal dimuat.");
    const buf = await readArrayBuffer(file);
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return TextUtil.clean(result.value);
  }

  async function readZipXml(file, pickTexts, sep) {
    await loadScript(JSZIP_CDN);
    if (!window.JSZip) throw new Error("Pustaka ZIP gagal dimuat.");
    const buf = await readArrayBuffer(file);
    const zip = await window.JSZip.loadAsync(buf);
    const parts = pickTexts(zip);
    const chunks = [];
    for (const name of parts) {
      const entry = zip.file(name);
      if (!entry) continue;
      let xml = await entry.async("string");
      xml = xml.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
      if (xml) chunks.push(xml);
    }
    return TextUtil.clean(chunks.join(sep || "\n"));
  }

  function readPptx(file) {
    return readZipXml(file, function (zip) {
      const names = Object.keys(zip.files);
      return names.filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); })
        .sort(function (a, b) { return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]); });
    }, "\n\n");
  }

  function readXlsx(file) {
    return readZipXml(file, function (zip) {
      return ["xl/sharedStrings.xml"].concat(Object.keys(zip.files).filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort(function (a, b) { return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]); }));
    }, "\n");
  }

  function extractFile(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") return readPdf(file);
    if (ext === "docx") return readDocx(file);
    if (ext === "pptx") return readPptx(file);
    if (ext === "xlsx") return readXlsx(file);
    // txt, md, csv, dan format teks lainnya
    return readTextFile(file);
  }

  /* ---- YouTube transcript ---- */
  function ytVideoId(url) {
    const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/);
    return m ? m[1] : null;
  }

  const TS_BLOCKED = "youtube-sedang-memblokir";

  async function httpGet(url, opts) {
    const signal = (opts && opts.signal) || (window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(22000) : undefined);
    const headers = (opts && opts.headers) || {};
    const resp = await fetch(url, { signal: signal, headers: headers });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return resp.text();
  }

  /* Ambil daftar track subtitle lewat API timedtext YouTube (tanpa proxy).
     Endpoint ini biasa mengizinkan CORS; jika kosong berarti tidak tersedia. */
  async function fetchTimedtext(vid) {
    const list = await httpGet("https://www.youtube.com/api/timedtext?type=list&v=" + vid);
    const tracks = [];
    const re = /<track[^>]*>/g;
    let m;
    while ((m = re.exec(list)) !== null) {
      const tag = m[0];
      const lang = (tag.match(/lang="([^"]+)"/) || [])[1] || "";
      const name = (tag.match(/name="([^"]*)"/) || [])[1] || lang;
      const kind = (tag.match(/kind="([^"]+)"/) || [])[1] || "manual";
      if (lang) tracks.push({ lang: lang, name: name, kind: kind });
    }
    if (!tracks.length) return "";
    // prefer manual berbahasa Indonesia, lalu manual, lalu auto id, lalu auto
    const pick = tracks.find(function (t) { return t.kind !== "asr" && t.lang === "id"; })
      || tracks.find(function (t) { return t.kind !== "asr"; })
      || tracks.find(function (t) { return t.lang === "id"; })
      || tracks[0];
    let url = "https://www.youtube.com/api/timedtext?type=track&lang=" + encodeURIComponent(pick.lang) + "&v=" + vid;
    if (pick.kind === "asr") url += "&kind=asr";
    const body = await httpGet(url);
    return parseTranscriptXml("<transcript>" + body + "</transcript>");
  }

  async function fetchYouTubeTranscript(url) {
    const vid = ytVideoId(url);
    if (!vid) throw new Error("Link YouTube tidak dikenali. Pastikan formatnya valid.");

    const tiers = [
      { name: "timedtext", run: function () { return fetchTimedtext(vid); } },
      { name: "youtube-transcript.io", run: async function () {
          const body = await httpGet("https://youtube-transcript.io/api/transcript?videoId=" + vid + "&format=json");
          if (!/^\s*[\[{]/.test(body)) throw new Error("layanan butuh kunci API");
          const data = JSON.parse(body);
          const arr = data.transcript || data;
          if (!Array.isArray(arr)) throw new Error("format tak dikenal");
          return arr.map(function (t) { return t.text || ""; }).filter(Boolean).join(" ");
        } },
      { name: "youtubetranscript(jina)", run: function () { return fetchSourceAsXml("https://youtubetranscript.com/?server_vid2=" + vid); } },
      { name: "youtubetranscript(allorigins)", run: function () { return fetchViaProxy("https://api.allorigins.win/raw?url=", "https://youtubetranscript.com/?server_vid2=" + vid); } },
      { name: "youtubetranscript(codetabs)", run: function () { return fetchViaProxy("https://api.codetabs.com/v1/proxy?quest=", "https://youtubetranscript.com/?server_vid2=" + vid); } }
    ];

    let lastErr = null;
    for (const tier of tiers) {
      try {
        const text = await tier.run();
        const clean = TextUtil.clean(String(text || ""));
        if (clean && clean.length > 40) return clean;
      } catch (e) { lastErr = e; }
    }
    if (lastErr && lastErr.message === TS_BLOCKED) {
      throw new Error("Layanan transkrip pihak ketiga sedang diblokir YouTube (bukan koneksimu). Coba video lain, ulangi beberapa saat lagi, atau tempel teksnya manual.");
    }
    throw new Error("Gagal mengambil transkrip YouTube. Coba lagi, atau tempel teksnya manual di bawah.");
  }

  async function fetchViaProxy(proxy, target) {
    const body = await httpGet(proxy + encodeURIComponent(target));
    return parseAnyTranscript(body);
  }

  async function fetchSourceAsXml(target) {
    const body = await httpGet("https://r.jina.ai/" + target, { headers: { "X-Return-Format": "text" } });
    return parseAnyTranscript(body);
  }

  /* Cari XML <transcript>/<text> atau kutipan halaman apa pun yang bisa dipakai. */
  function parseAnyTranscript(content) {
    if (String(content).indexOf("currently blocking us") !== -1 ||
        String(content).indexOf("we're sorry, youtube is currently") !== -1) {
      throw new Error(TS_BLOCKED);
    }
    const text = parseTranscriptXml(String(content));
    if (text && text.trim().length > 20) return text;
    return "";
  }

  function parseTranscriptXml(xml) {
    // buang segala teks sebelum tag <transcript> agar aman walau dibungkus HTML/markdown
    const doc = String(xml);
    const start = doc.search(/<text\b/i);
    const slice = start === -1 ? doc : doc.slice(start);
    const texts = [];
    const re = /<text\b[^>]*>(.*?)<\/text>/gs;
    let m;
    while ((m = re.exec(slice)) !== null) {
      texts.push(m[1].replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    }
    return texts.join(" ");
  }

  return {
    extractFile: extractFile,
    fetchYouTubeTranscript: fetchYouTubeTranscript,
    ytVideoId: ytVideoId,
    parseTranscriptXml: parseTranscriptXml
  };
})();
if (typeof globalThis !== "undefined" && window.Extractor) globalThis.Extractor = window.Extractor;