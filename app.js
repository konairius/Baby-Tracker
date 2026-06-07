/* Baby Food Tracker
 * Stores feeding entries in localStorage and renders a feeding log,
 * grand totals, and a per-day summary. Consumed = provided - notConsumed.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "baby-food-tracker.entries";

  /** @typedef {{id: string, date: string, time: string, provided: number, notConsumed: number, updatedAt: number, deleted?: boolean}} Entry */

  /** @type {Entry[]} */
  let entries = load();
  /** id of the entry currently being edited, or null */
  let editingId = null;

  // --- DOM references ---
  const form = document.getElementById("entry-form");
  const dateInput = document.getElementById("date");
  const timeInput = document.getElementById("time");
  const providedInput = document.getElementById("provided");
  const notConsumedInput = document.getElementById("notConsumed");
  const submitBtn = document.getElementById("submit-btn");
  const cancelBtn = document.getElementById("cancel-btn");
  const formError = document.getElementById("form-error");

  const entriesBody = document.getElementById("entries-body");
  const emptyState = document.getElementById("empty-state");
  const grandTotals = document.getElementById("grand-totals");

  const summaryBody = document.getElementById("summary-body");
  const summaryEmpty = document.getElementById("summary-empty");

  const clearBtn = document.getElementById("clear-btn");

  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const importFile = document.getElementById("import-file");
  const importMsg = document.getElementById("import-msg");

  const pdfBtn = document.getElementById("pdf-btn");
  const photoBtn = document.getElementById("photo-btn");
  const photoPanel = document.getElementById("photo-panel");
  const sheetDate = document.getElementById("sheet-date");
  const photoFile = document.getElementById("photo-file");
  const readPhotoBtn = document.getElementById("read-photo");
  const photoStatus = document.getElementById("photo-status");
  const reviewPanel = document.getElementById("review");
  const reviewBody = document.getElementById("review-body");
  const addReviewedBtn = document.getElementById("add-reviewed");
  const discardReviewedBtn = document.getElementById("discard-reviewed");

  const shareBtn = document.getElementById("share-btn");
  const sharePanel = document.getElementById("share-panel");
  const shareIntro = document.getElementById("share-intro");
  const createSpaceBtn = document.getElementById("create-space");
  const shareStatusEl = document.getElementById("share-status");
  const shareActive = document.getElementById("share-active");
  const shareLinkInput = document.getElementById("share-link");
  const copyLinkBtn = document.getElementById("copy-link");
  const leaveShareBtn = document.getElementById("leave-share");

  // --- Persistence ---
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Migrate older entries that predate sync (no updatedAt field).
      const base = Date.now();
      return parsed.map((e) =>
        typeof e.updatedAt === "number" ? e : Object.assign({ updatedAt: base }, e)
      );
    } catch (err) {
      console.error("Failed to load entries:", err);
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
      console.error("Failed to save entries:", err);
    }
  }

  // Entries not tombstoned by a delete.
  function activeEntries() {
    return entries.filter((e) => !e.deleted);
  }

  // Persist + re-render, then let the sync layer (if active) push the change.
  function commit() {
    save();
    render();
    if (window.BabySync && window.BabySync.localChanged) window.BabySync.localChanged();
  }

  // Called by the sync layer when a merged set arrives from the server.
  // Replaces the local store without re-triggering a push.
  function applyMerged(merged) {
    entries = merged;
    save();
    render();
  }

  // --- Helpers ---
  function consumed(entry) {
    return Math.max(0, entry.provided - entry.notConsumed);
  }

  function fmt(n) {
    // Show integers cleanly, otherwise up to one decimal.
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function formatDate(iso) {
    // iso is YYYY-MM-DD; render in the visitor's locale without timezone shifts.
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
  }

  function clearError() {
    formError.textContent = "";
    formError.hidden = true;
  }

  // Active entries, sorted newest first by date+time.
  function sortedEntries() {
    return activeEntries().sort((a, b) =>
      (b.date + "T" + b.time).localeCompare(a.date + "T" + a.time)
    );
  }

  // --- Rendering ---
  function render() {
    renderEntries();
    renderSummary();
  }

  function renderEntries() {
    entriesBody.innerHTML = "";

    if (activeEntries().length === 0) {
      emptyState.hidden = false;
      grandTotals.innerHTML = "";
      return;
    }
    emptyState.hidden = true;

    let totProvided = 0;
    let totNotConsumed = 0;

    for (const entry of sortedEntries()) {
      totProvided += entry.provided;
      totNotConsumed += entry.notConsumed;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="Date">${formatDate(entry.date)}</td>
        <td data-label="Time">${entry.time}</td>
        <td class="num" data-label="Provided (ml)">${fmt(entry.provided)}</td>
        <td class="num" data-label="Not consumed (ml)">${fmt(entry.notConsumed)}</td>
        <td class="num consumed" data-label="Consumed (ml)">${fmt(consumed(entry))}</td>
        <td class="row-actions">
          <button class="icon-btn edit" data-id="${entry.id}" title="Edit" aria-label="Edit">✏️</button>
          <button class="icon-btn delete" data-id="${entry.id}" title="Delete" aria-label="Delete">🗑️</button>
        </td>`;
      entriesBody.appendChild(tr);
    }

    const totConsumed = Math.max(0, totProvided - totNotConsumed);
    grandTotals.innerHTML =
      `<span>Total consumed: <strong>${fmt(totConsumed)} ml</strong></span>` +
      ` &nbsp;·&nbsp; <span>Provided: <strong>${fmt(totProvided)} ml</strong></span>`;
  }

  function renderSummary() {
    summaryBody.innerHTML = "";

    const active = activeEntries();
    if (active.length === 0) {
      summaryEmpty.hidden = false;
      return;
    }
    summaryEmpty.hidden = true;

    // Aggregate by date.
    const byDate = new Map();
    for (const entry of active) {
      const agg = byDate.get(entry.date) || {
        count: 0,
        provided: 0,
        notConsumed: 0,
      };
      agg.count += 1;
      agg.provided += entry.provided;
      agg.notConsumed += entry.notConsumed;
      byDate.set(entry.date, agg);
    }

    const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

    let gProvided = 0;
    let gNotConsumed = 0;
    let gCount = 0;

    for (const date of dates) {
      const agg = byDate.get(date);
      const cons = Math.max(0, agg.provided - agg.notConsumed);
      gProvided += agg.provided;
      gNotConsumed += agg.notConsumed;
      gCount += agg.count;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="Date">${formatDate(date)}</td>
        <td class="num" data-label="Feedings">${agg.count}</td>
        <td class="num" data-label="Provided (ml)">${fmt(agg.provided)}</td>
        <td class="num" data-label="Not consumed (ml)">${fmt(agg.notConsumed)}</td>
        <td class="num consumed" data-label="Consumed (ml)">${fmt(cons)}</td>`;
      summaryBody.appendChild(tr);
    }

    // Overall total row.
    if (dates.length > 1) {
      const gCons = Math.max(0, gProvided - gNotConsumed);
      const tr = document.createElement("tr");
      tr.className = "summary-total";
      tr.innerHTML = `
        <td data-label="">All days</td>
        <td class="num" data-label="Feedings">${gCount}</td>
        <td class="num" data-label="Provided (ml)">${fmt(gProvided)}</td>
        <td class="num" data-label="Not consumed (ml)">${fmt(gNotConsumed)}</td>
        <td class="num" data-label="Consumed (ml)">${fmt(gCons)}</td>`;
      summaryBody.appendChild(tr);
    }
  }

  // --- Form handling ---
  function resetForm() {
    editingId = null;
    form.reset();
    notConsumedInput.value = "0";
    setDefaults();
    submitBtn.textContent = "Add";
    cancelBtn.hidden = true;
    clearError();
  }

  function setDefaults() {
    if (!dateInput.value) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      dateInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      timeInput.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
  }

  function startEdit(id) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    editingId = id;
    dateInput.value = entry.date;
    timeInput.value = entry.time;
    providedInput.value = entry.provided;
    notConsumedInput.value = entry.notConsumed;
    submitBtn.textContent = "Save";
    cancelBtn.hidden = false;
    clearError();
    providedInput.focus();
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearError();

    const date = dateInput.value;
    const time = timeInput.value;
    const provided = parseFloat(providedInput.value);
    const notConsumed = parseFloat(notConsumedInput.value);

    if (!date || !time) {
      showError("Please enter both a date and a time.");
      return;
    }
    if (!Number.isFinite(provided) || provided < 0) {
      showError("Provided amount must be 0 or more.");
      return;
    }
    if (!Number.isFinite(notConsumed) || notConsumed < 0) {
      showError("Not-consumed amount must be 0 or more.");
      return;
    }
    if (notConsumed > provided) {
      showError("Not-consumed amount can't be greater than the provided amount.");
      return;
    }

    if (editingId) {
      const entry = entries.find((en) => en.id === editingId);
      if (entry) {
        entry.date = date;
        entry.time = time;
        entry.provided = provided;
        entry.notConsumed = notConsumed;
        entry.updatedAt = Date.now();
      }
    } else {
      entries.push({ id: uid(), date, time, provided, notConsumed, updatedAt: Date.now() });
    }

    commit();
    resetForm();
  });

  cancelBtn.addEventListener("click", resetForm);

  entriesBody.addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (btn.classList.contains("edit")) {
      startEdit(id);
    } else if (btn.classList.contains("delete")) {
      if (confirm("Delete this feeding entry?")) {
        // Tombstone (not remove) so the deletion can sync to other devices.
        const entry = entries.find((en) => en.id === id);
        if (entry) {
          entry.deleted = true;
          entry.updatedAt = Date.now();
        }
        if (editingId === id) resetForm();
        commit();
      }
    }
  });

  clearBtn.addEventListener("click", function () {
    if (activeEntries().length === 0) return;
    if (confirm("Delete ALL feeding entries? This cannot be undone.")) {
      const now = Date.now();
      for (const e of entries) {
        if (!e.deleted) {
          e.deleted = true;
          e.updatedAt = now;
        }
      }
      commit();
      resetForm();
    }
  });

  // --- CSV import / export ---
  const CSV_HEADERS = [
    "Date",
    "Time",
    "Provided (ml)",
    "Not consumed (ml)",
    "Consumed (ml)",
  ];

  function showImportMsg(msg, type) {
    importMsg.textContent = msg;
    importMsg.className = "import-msg " + (type || "");
    importMsg.hidden = false;
  }

  // Quote a CSV field if it contains comma, quote, or newline.
  function csvCell(value) {
    const s = String(value);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function exportCsv() {
    if (activeEntries().length === 0) {
      showImportMsg("Nothing to export yet — add a feeding first.", "error");
      return;
    }
    const rows = [CSV_HEADERS.join(",")];
    for (const entry of sortedEntries()) {
      rows.push(
        [
          entry.date,
          entry.time,
          entry.provided,
          entry.notConsumed,
          consumed(entry),
        ]
          .map(csvCell)
          .join(",")
      );
    }
    const csv = rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `baby-food-tracker-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showImportMsg(`Exported ${activeEntries().length} feeding(s).`, "success");
  }

  // Parse CSV text into an array of string-arrays (handles quotes/newlines).
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    // Strip a UTF-8 BOM if present.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        // Handle CRLF without producing an empty row.
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
    // Flush the final field/row if the file didn't end with a newline.
    if (field !== "" || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function normalizeDate(value) {
    const v = value.trim();
    // Already ISO YYYY-MM-DD.
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    // Accept D/M/YYYY or D.M.YYYY by reordering to ISO.
    const m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) {
      const pad = (n) => n.padStart(2, "0");
      return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    }
    return null;
  }

  function normalizeTime(value) {
    const v = value.trim();
    const m = v.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = m[1].padStart(2, "0");
    return `${h}:${m[2]}`;
  }

  function importCsv(text) {
    const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
    if (rows.length === 0) {
      showImportMsg("That file is empty.", "error");
      return;
    }

    // Skip the header row if the first cell isn't a date.
    let start = 0;
    if (!normalizeDate(rows[0][0] || "")) start = 1;

    const imported = [];
    let skipped = 0;

    for (let i = start; i < rows.length; i++) {
      const cols = rows[i];
      const date = normalizeDate(cols[0] || "");
      const time = normalizeTime(cols[1] || "");
      const provided = parseFloat(cols[2]);
      const notConsumed = parseFloat(cols[3]);

      if (
        !date ||
        !time ||
        !Number.isFinite(provided) ||
        provided < 0 ||
        !Number.isFinite(notConsumed) ||
        notConsumed < 0 ||
        notConsumed > provided
      ) {
        skipped++;
        continue;
      }
      imported.push({ id: uid(), date, time, provided, notConsumed, updatedAt: Date.now() });
    }

    if (imported.length === 0) {
      showImportMsg(
        "No valid rows found. Expected columns: Date, Time, Provided, Not consumed.",
        "error"
      );
      return;
    }

    const replace =
      activeEntries().length > 0 &&
      !confirm(
        `Import ${imported.length} feeding(s)?\n\n` +
          "OK = add to your existing entries\n" +
          "Cancel = replace all existing entries"
      );

    if (replace) {
      // Tombstone existing entries (so the replacement syncs) then add the new ones.
      const now = Date.now();
      for (const e of entries) {
        if (!e.deleted) {
          e.deleted = true;
          e.updatedAt = now;
        }
      }
    }
    entries = entries.concat(imported);

    commit();
    const note = skipped > 0 ? ` (${skipped} row(s) skipped)` : "";
    showImportMsg(
      `Imported ${imported.length} feeding(s)${note}.`,
      "success"
    );
  }

  exportBtn.addEventListener("click", exportCsv);

  importBtn.addEventListener("click", function () {
    importMsg.hidden = true;
    importFile.click();
  });

  importFile.addEventListener("change", function () {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        importCsv(String(reader.result));
      } catch (err) {
        console.error("CSV import failed:", err);
        showImportMsg("Could not read that file.", "error");
      }
    };
    reader.onerror = function () {
      showImportMsg("Could not read that file.", "error");
    };
    reader.readAsText(file);
    // Reset so selecting the same file again re-triggers change.
    importFile.value = "";
  });

  // --- Printable tracking sheet (PDF) ---
  pdfBtn.addEventListener("click", function () {
    if (typeof window.generateTrackingSheetPdf !== "function") {
      showImportMsg("Could not generate the PDF (script not loaded).", "error");
      return;
    }
    const blob = window.generateTrackingSheetPdf();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "baby-food-tracking-sheet.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // --- Photo import (on-device OCR with Tesseract.js) ---
  function showPhotoStatus(msg, type) {
    photoStatus.textContent = msg;
    photoStatus.className = "photo-status " + (type || "");
    photoStatus.hidden = false;
  }

  function today() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  photoBtn.addEventListener("click", function () {
    photoPanel.hidden = !photoPanel.hidden;
    if (!photoPanel.hidden) {
      if (!sheetDate.value) sheetDate.value = today();
      photoPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load that image."));
      };
      img.src = url;
    });
  }

  // Downscale, grayscale, and Otsu-threshold the photo to clean black/white —
  // Tesseract reads high-contrast images far better than raw phone photos.
  function preprocess(img, maxDim) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const hist = new Array(256).fill(0);
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      gray[p] = g;
      hist[g]++;
    }

    // Otsu threshold.
    const total = w * h;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0;
    let wB = 0;
    let maxVar = 0;
    let thr = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) {
        maxVar = between;
        thr = t;
      }
    }

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = gray[p] > thr ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  async function ocrImage(canvas, onProgress) {
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: function (m) {
        if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
      },
    });
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789:/.- ",
      tessedit_pageseg_mode: "6",
    });
    const result = await worker.recognize(canvas);
    await worker.terminate();
    return (result && result.data && result.data.text) || "";
  }

  const pad2 = (n) => String(n).padStart(2, "0");

  // Turn recognized text into candidate rows: per line, pull a time, an
  // optional date, then remaining numbers as provided / not consumed. Rows
  // without a date fall back to the sheet date.
  function parseRows(text, fallbackDate) {
    const rows = [];
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!/\d/.test(line)) continue;

      const tm = line.match(/(\d{1,2}):(\d{2})/);
      const time = tm ? pad2(tm[1]) + ":" + tm[2] : "";

      let date = "";
      let dm = line.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (dm) {
        date = dm[1] + "-" + pad2(dm[2]) + "-" + pad2(dm[3]);
      } else {
        dm = line.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
        if (dm) {
          let y = dm[3];
          if (y.length === 2) y = "20" + y;
          date = y + "-" + pad2(dm[2]) + "-" + pad2(dm[1]);
        }
      }

      let rest = line;
      if (tm) rest = rest.replace(tm[0], " ");
      if (dm) rest = rest.replace(dm[0], " ");
      const nums = (rest.match(/\d+/g) || []).map((s) => parseInt(s, 10));
      const provided = nums.length > 0 ? nums[0] : "";
      const notConsumed = nums.length > 1 ? nums[1] : 0;

      if (time === "" && provided === "") continue;
      rows.push({
        date: date || fallbackDate || "",
        time: time,
        provided: provided,
        notConsumed: notConsumed,
      });
    }
    return rows;
  }

  function renderReview(rows) {
    reviewBody.innerHTML = "";
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="Date"><input type="date" class="r-date" value="${row.date || ""}" /></td>
        <td data-label="Time"><input type="time" class="r-time" value="${row.time || ""}" /></td>
        <td class="num" data-label="Provided (ml)"><input type="number" min="0" step="1" class="r-provided" value="${
          row.provided !== "" && row.provided != null ? row.provided : ""
        }" /></td>
        <td class="num" data-label="Not consumed (ml)"><input type="number" min="0" step="1" class="r-notconsumed" value="${
          row.notConsumed != null ? row.notConsumed : 0
        }" /></td>
        <td class="review-remove-cell"><button type="button" class="review-remove" title="Remove">🗑️ Remove</button></td>`;
      tr.querySelector(".review-remove").addEventListener("click", function () {
        tr.remove();
      });
      reviewBody.appendChild(tr);
    }
    reviewPanel.hidden = rows.length === 0;
  }

  readPhotoBtn.addEventListener("click", async function () {
    const file = photoFile.files && photoFile.files[0];
    if (!file) {
      showPhotoStatus("Choose a photo of the sheet first.", "error");
      return;
    }
    if (typeof Tesseract === "undefined") {
      showPhotoStatus(
        "The photo reader could not load. Check your internet connection and try again.",
        "error"
      );
      return;
    }

    readPhotoBtn.disabled = true;
    showPhotoStatus("Loading the reader…", "info");
    try {
      const img = await loadImage(file);
      const canvas = preprocess(img, 1800);
      const text = await ocrImage(canvas, function (p) {
        showPhotoStatus("Reading the photo… " + Math.round(p * 100) + "%", "info");
      });
      const rows = parseRows(text, sheetDate.value);
      if (rows.length === 0) {
        showPhotoStatus(
          "Couldn't read any rows. Try a clearer, straighter photo in good light, or add them manually.",
          "error"
        );
        reviewPanel.hidden = true;
      } else {
        renderReview(rows);
        showPhotoStatus(
          `Read ${rows.length} row(s) — please check each one carefully before adding.`,
          "success"
        );
      }
    } catch (err) {
      console.error("Photo OCR failed:", err);
      showPhotoStatus(err.message || "Could not read the photo.", "error");
    } finally {
      readPhotoBtn.disabled = false;
    }
  });

  addReviewedBtn.addEventListener("click", function () {
    const trs = Array.from(reviewBody.querySelectorAll("tr"));
    let added = 0;
    let skipped = 0;
    for (const tr of trs) {
      const date = tr.querySelector(".r-date").value;
      const time = tr.querySelector(".r-time").value;
      const provided = parseFloat(tr.querySelector(".r-provided").value);
      const notConsumed = parseFloat(tr.querySelector(".r-notconsumed").value);
      if (
        !date ||
        !time ||
        !Number.isFinite(provided) ||
        provided < 0 ||
        !Number.isFinite(notConsumed) ||
        notConsumed < 0 ||
        notConsumed > provided
      ) {
        skipped++;
        continue;
      }
      entries.push({ id: uid(), date, time, provided, notConsumed, updatedAt: Date.now() });
      added++;
    }
    if (added === 0) {
      showPhotoStatus("No valid rows to add — check the highlighted fields.", "error");
      return;
    }
    commit();
    reviewPanel.hidden = true;
    reviewBody.innerHTML = "";
    photoFile.value = "";
    const note = skipped > 0 ? ` (${skipped} row(s) skipped)` : "";
    showPhotoStatus(`Added ${added} feeding(s)${note}.`, "success");
  });

  discardReviewedBtn.addEventListener("click", function () {
    reviewPanel.hidden = true;
    reviewBody.innerHTML = "";
    showPhotoStatus("Discarded.", "info");
  });

  // --- Sharing / sync UI ---
  function statusLabel(s) {
    switch (s) {
      case "syncing": return "Syncing…";
      case "synced": return "✓ Synced";
      case "offline": return "⚠ Offline — will retry";
      default: return "";
    }
  }

  function renderShare(state) {
    if (!state) {
      state = window.BabySync
        ? window.BabySync.state()
        : { configured: false, sharing: false, status: "off" };
    }

    if (!state.configured) {
      shareIntro.hidden = false;
      shareIntro.textContent =
        "Online sharing isn't enabled on this site yet. Everything stays on this device.";
      createSpaceBtn.hidden = true;
      shareActive.hidden = true;
      shareStatusEl.textContent = "";
      return;
    }

    if (!state.sharing) {
      shareIntro.hidden = false;
      shareIntro.textContent =
        "Sync this baby's log across phones. This uploads an end-to-end encrypted copy and gives you a private link to share with family — the server can't read your data.";
      createSpaceBtn.hidden = false;
      shareActive.hidden = true;
    } else {
      shareIntro.hidden = true;
      createSpaceBtn.hidden = true;
      shareActive.hidden = false;
      shareLinkInput.value = window.BabySync.shareLink() || "";
    }
    shareStatusEl.textContent = statusLabel(state.status);
    shareStatusEl.className = "share-status " + (state.status || "");
  }

  shareBtn.addEventListener("click", function () {
    sharePanel.hidden = !sharePanel.hidden;
    if (!sharePanel.hidden) {
      renderShare();
      sharePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  createSpaceBtn.addEventListener("click", async function () {
    if (!window.BabySync) return;
    createSpaceBtn.disabled = true;
    shareStatusEl.textContent = "Creating…";
    try {
      await window.BabySync.createSpace();
    } catch (err) {
      console.error("Create space failed:", err);
    }
    createSpaceBtn.disabled = false;
    renderShare();
  });

  copyLinkBtn.addEventListener("click", async function () {
    try {
      await navigator.clipboard.writeText(shareLinkInput.value);
      copyLinkBtn.textContent = "Copied!";
      setTimeout(function () {
        copyLinkBtn.textContent = "Copy";
      }, 1500);
    } catch (err) {
      shareLinkInput.select();
    }
  });

  leaveShareBtn.addEventListener("click", function () {
    if (!window.BabySync) return;
    if (
      confirm(
        "Stop syncing on this device? Your entries stay here, but changes won't sync until you open the share link again."
      )
    ) {
      window.BabySync.leave();
      renderShare();
    }
  });

  // --- Init ---
  setDefaults();
  render();
  if (window.BabySync) {
    window.BabySync.init({
      getEntries: function () {
        return entries;
      },
      applyMerged: applyMerged,
      onStatus: renderShare,
    });
  }
})();
