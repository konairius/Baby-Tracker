/* Baby Food Tracker
 * Stores feeding entries in localStorage and renders a feeding log,
 * grand totals, and a per-day summary. Consumed = provided - notConsumed.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "baby-food-tracker.entries";

  /** @typedef {{id: string, date: string, time: string, provided: number, notConsumed: number}} Entry */

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
  const keySetup = document.getElementById("key-setup");
  const keyReady = document.getElementById("key-ready");
  const apiKeyInput = document.getElementById("api-key");
  const saveKeyBtn = document.getElementById("save-key");
  const changeKeyBtn = document.getElementById("change-key");
  const photoFile = document.getElementById("photo-file");
  const readPhotoBtn = document.getElementById("read-photo");
  const photoStatus = document.getElementById("photo-status");
  const reviewPanel = document.getElementById("review");
  const reviewBody = document.getElementById("review-body");
  const addReviewedBtn = document.getElementById("add-reviewed");
  const discardReviewedBtn = document.getElementById("discard-reviewed");

  const KEY_STORAGE = "baby-food-tracker.apiKey";
  // Single fixed model — chosen for best handwriting accuracy. No UI needed.
  const OCR_MODEL = "claude-opus-4-8";

  // --- Persistence ---
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
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

  // Sort newest first by date+time.
  function sortedEntries() {
    return entries
      .slice()
      .sort((a, b) =>
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

    if (entries.length === 0) {
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
        <td>${formatDate(entry.date)}</td>
        <td>${entry.time}</td>
        <td class="num">${fmt(entry.provided)}</td>
        <td class="num">${fmt(entry.notConsumed)}</td>
        <td class="num consumed">${fmt(consumed(entry))}</td>
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

    if (entries.length === 0) {
      summaryEmpty.hidden = false;
      return;
    }
    summaryEmpty.hidden = true;

    // Aggregate by date.
    const byDate = new Map();
    for (const entry of entries) {
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
        <td>${formatDate(date)}</td>
        <td class="num">${agg.count}</td>
        <td class="num">${fmt(agg.provided)}</td>
        <td class="num">${fmt(agg.notConsumed)}</td>
        <td class="num consumed">${fmt(cons)}</td>`;
      summaryBody.appendChild(tr);
    }

    // Overall total row.
    if (dates.length > 1) {
      const gCons = Math.max(0, gProvided - gNotConsumed);
      const tr = document.createElement("tr");
      tr.className = "summary-total";
      tr.innerHTML = `
        <td>All days</td>
        <td class="num">${gCount}</td>
        <td class="num">${fmt(gProvided)}</td>
        <td class="num">${fmt(gNotConsumed)}</td>
        <td class="num">${fmt(gCons)}</td>`;
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
      }
    } else {
      entries.push({ id: uid(), date, time, provided, notConsumed });
    }

    save();
    render();
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
        entries = entries.filter((en) => en.id !== id);
        if (editingId === id) resetForm();
        save();
        render();
      }
    }
  });

  clearBtn.addEventListener("click", function () {
    if (entries.length === 0) return;
    if (confirm("Delete ALL feeding entries? This cannot be undone.")) {
      entries = [];
      save();
      render();
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
    if (entries.length === 0) {
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
    showImportMsg(`Exported ${entries.length} feeding(s).`, "success");
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
      imported.push({ id: uid(), date, time, provided, notConsumed });
    }

    if (imported.length === 0) {
      showImportMsg(
        "No valid rows found. Expected columns: Date, Time, Provided, Not consumed.",
        "error"
      );
      return;
    }

    const replace =
      entries.length > 0 &&
      !confirm(
        `Import ${imported.length} feeding(s)?\n\n` +
          "OK = add to your existing entries\n" +
          "Cancel = replace all existing entries"
      );

    if (replace) {
      entries = imported;
    } else {
      entries = entries.concat(imported);
    }

    save();
    render();
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

  // --- Photo import (OCR via the Claude API) ---
  function showPhotoStatus(msg, type) {
    photoStatus.textContent = msg;
    photoStatus.className = "photo-status " + (type || "");
    photoStatus.hidden = false;
  }

  function storedKey() {
    try {
      return (localStorage.getItem(KEY_STORAGE) || "").trim();
    } catch (err) {
      return "";
    }
  }

  // Show the one-time key setup, or the "ready" view once a key exists.
  function refreshKeyView() {
    const hasKey = storedKey().length > 0;
    keySetup.hidden = hasKey;
    keyReady.hidden = !hasKey;
    if (!hasKey) apiKeyInput.value = "";
  }

  photoBtn.addEventListener("click", function () {
    photoPanel.hidden = !photoPanel.hidden;
    if (!photoPanel.hidden) {
      refreshKeyView();
      photoPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  saveKeyBtn.addEventListener("click", function () {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showPhotoStatus("Please paste your key first.", "error");
      return;
    }
    try {
      localStorage.setItem(KEY_STORAGE, key);
    } catch (err) {
      showPhotoStatus("Could not save the key on this device.", "error");
      return;
    }
    refreshKeyView();
    showPhotoStatus("Saved — you can now read photos.", "success");
  });

  changeKeyBtn.addEventListener("click", function () {
    keySetup.hidden = false;
    keyReady.hidden = true;
    apiKeyInput.value = storedKey();
    apiKeyInput.focus();
  });

  // Downscale the photo client-side to keep upload size and token cost sane,
  // and normalize to JPEG.
  function fileToDownscaledJpeg(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load that image."));
      };
      img.src = url;
    });
  }

  function today() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  async function callClaudeOcr(base64, mediaType, apiKey) {
    const schema = {
      type: "object",
      properties: {
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "ISO date, YYYY-MM-DD" },
              time: { type: "string", description: "24-hour time, HH:MM" },
              provided: { type: "number", description: "millilitres provided" },
              notConsumed: {
                type: "number",
                description: "millilitres left over / not consumed",
              },
            },
            required: ["date", "time", "provided", "notConsumed"],
            additionalProperties: false,
          },
        },
      },
      required: ["entries"],
      additionalProperties: false,
    };

    const prompt =
      "This image is a handwritten baby feeding tracker sheet. Each filled row " +
      "records one feeding with columns: Date, Time, Provided (ml), and Not " +
      "consumed (ml) (the amount left over). Extract every filled-in row. Rules: " +
      "dates as YYYY-MM-DD; if a row omits the date, use the sheet's date header " +
      "or the date from adjacent rows; if the year is missing assume " +
      today() +
      ". Times as 24-hour HH:MM. Amounts are millilitres as plain numbers. If " +
      "'Not consumed' is blank, use 0. Skip the header row and any empty rows. " +
      "Today's date is " +
      today() +
      ".";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        max_tokens: 8000,
        output_config: { format: { type: "json_schema", schema: schema } },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const errBody = await res.json();
        detail = (errBody.error && errBody.error.message) || "";
      } catch (e) {
        /* ignore */
      }
      throw new Error("API error " + res.status + (detail ? ": " + detail : ""));
    }

    const data = await res.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) throw new Error("No text returned by the model.");
    const parsed = JSON.parse(textBlock.text);
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  }

  function renderReview(rows) {
    reviewBody.innerHTML = "";
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="date" class="r-date" value="${row.date || ""}" /></td>
        <td><input type="time" class="r-time" value="${row.time || ""}" /></td>
        <td class="num"><input type="number" min="0" step="1" class="r-provided" value="${
          row.provided != null ? row.provided : ""
        }" /></td>
        <td class="num"><input type="number" min="0" step="1" class="r-notconsumed" value="${
          row.notConsumed != null ? row.notConsumed : 0
        }" /></td>
        <td><button type="button" class="review-remove" title="Remove">🗑️</button></td>`;
      tr.querySelector(".review-remove").addEventListener("click", function () {
        tr.remove();
      });
      reviewBody.appendChild(tr);
    }
    reviewPanel.hidden = rows.length === 0;
  }

  readPhotoBtn.addEventListener("click", async function () {
    const apiKey = storedKey();
    const file = photoFile.files && photoFile.files[0];
    if (!apiKey) {
      refreshKeyView();
      showPhotoStatus("Please add your API key first.", "error");
      return;
    }
    if (!file) {
      showPhotoStatus("Choose a photo of the sheet first.", "error");
      return;
    }

    readPhotoBtn.disabled = true;
    showPhotoStatus("Reading the photo…", "info");
    try {
      const { base64, mediaType } = await fileToDownscaledJpeg(file, 2000, 0.85);
      const rows = await callClaudeOcr(base64, mediaType, apiKey);
      if (rows.length === 0) {
        showPhotoStatus("No feedings were found in that photo.", "error");
        reviewPanel.hidden = true;
      } else {
        renderReview(rows);
        showPhotoStatus(
          `Found ${rows.length} feeding(s). Review and edit below, then add them.`,
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
      entries.push({ id: uid(), date, time, provided, notConsumed });
      added++;
    }
    if (added === 0) {
      showPhotoStatus("No valid rows to add — check the highlighted fields.", "error");
      return;
    }
    save();
    render();
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

  // --- Init ---
  setDefaults();
  render();
})();
