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

  // --- Init ---
  setDefaults();
  render();
})();
