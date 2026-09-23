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

  async function fetchYouTubeTranscript(url) {
    const vid = ytVideoId(url);
    if (!vid) throw new Error("Link YouTube tidak dikenali. Pastikan formatnya valid.");
    const target = encodeURIComponent("https://youtubetranscript.com/?server_vid2=" + vid);
    // coba beberapa proxy CORS publik
    const proxies = [
      "https://api.allorigins.win/raw?url=" + target,
      "https://corsproxy.io/?url=" + target,
      "https://api.codetabs.com/v1/proxy?quest=" + target
    ];
    let lastErr = null;
    for (const proxy of proxies) {
      try {
        const resp = await fetch(proxy, { signal: AbortSignal.timeout(25000) });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const xml = await resp.text();
        const caps = parseTranscriptXml(xml);
        if (caps && caps.trim().length > 40) return TextUtil.clean(caps);
      } catch (e) { lastErr = e; }
    }
    if (lastErr) throw new Error("Gagal mengambil transkrip YouTube (batasan proxy internet). Coba tempel teksnya manual atau cek koneksi.");
    return "";
  }

  function parseTranscriptXml(xml) {
    const texts = [];
    const re = /<text[^>]*>(.*?)<\/text>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
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