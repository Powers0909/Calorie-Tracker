(function () {
  "use strict";

  // -----------------------------
  // State + persistence
  // -----------------------------
  const STORAGE_KEY = "calorie-tracker-data";
  let state = loadState();
  let viewDate = todayKey();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          goal: parsed.goal || 2000,
          days: parsed.days || {}
        };
      }
    } catch (e) {
      // ignore
    }
    return { goal: 2000, days: {} };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getEntries(dateKey) {
    return state.days[dateKey] || [];
  }

  function setEntries(dateKey, entries) {
    if (!entries || entries.length === 0) {
      delete state.days[dateKey];
    } else {
      state.days[dateKey] = entries;
    }
    saveState();
  }

  // -----------------------------
  // Helpers
  // -----------------------------
  function todayKey() {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function formatDisplayDate(key) {
    const t = todayKey();
    if (key === t) return "Today";

    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yKey =
      y.getFullYear() +
      "-" +
      String(y.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(y.getDate()).padStart(2, "0");
    if (key === yKey) return "Yesterday";

    const parts = key.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
  }

  function shiftDate(key, delta) {
    const parts = key.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setDate(date.getDate() + delta);
    return (
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0")
    );
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // -----------------------------
  // Ring
  // -----------------------------
  const CIRCUMFERENCE = 2 * Math.PI * 52; // ~326.73

  function updateRing(consumed, goal) {
    const ratio = Math.min(consumed / goal, 1);
    const offset = CIRCUMFERENCE - ratio * CIRCUMFERENCE;
    ringFill.style.strokeDashoffset = offset;
    if (consumed > goal) ringFill.classList.add("over");
    else ringFill.classList.remove("over");
  }

  // -----------------------------
  // DOM refs
  // -----------------------------
  const currentDateEl = document.getElementById("current-date");
  const prevDayBtn = document.getElementById("prev-day");
  const nextDayBtn = document.getElementById("next-day");

  const caloriesConsumedEl = document.getElementById("calories-consumed");
  const caloriesRemainingEl = document.getElementById("calories-remaining");
  const calorieGoalEl = document.getElementById("calorie-goal");
  const ringFill = document.getElementById("ring-fill");

  const entryForm = document.getElementById("entry-form");
  const foodNameInput = document.getElementById("food-name");
  const foodCaloriesInput = document.getElementById("food-calories");

  const entriesList = document.getElementById("entries-list");
  const noEntries = document.getElementById("no-entries");
  const clearAllBtn = document.getElementById("clear-all");

  const goalInput = document.getElementById("goal-input");

  // Calendar
  const toggleCalBtn = document.getElementById("toggle-calendar");
  const calendarSection = document.getElementById("calendar-section");
  const calMonthLabel = document.getElementById("cal-month-label");
  const prevMonthBtn = document.getElementById("prev-month");
  const nextMonthBtn = document.getElementById("next-month");
  const calDaysContainer = document.getElementById("cal-days");

  let calendarOpen = false;
  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth();

  // Barcode tools
  const barcodeInput = document.getElementById("barcode-input");
  const barcodeLookupBtn = document.getElementById("barcode-lookup");
  const barcodeScanBtn = document.getElementById("barcode-scan");
  const barcodeStatus = document.getElementById("barcode-status");

  // Scanner modal
  const scannerModal = document.getElementById("scanner-modal");
  const scannerVideo = document.getElementById("scanner-video");
  const scannerCloseBtn = document.getElementById("scanner-close");

  let scanControls = null;
  let codeReader = null;

  // -----------------------------
  // Render
  // -----------------------------
  function render() {
    const entries = getEntries(viewDate);
    const consumed = entries.reduce((sum, e) => sum + e.calories, 0);
    const remaining = Math.max(0, state.goal - consumed);

    currentDateEl.textContent = formatDisplayDate(viewDate);

    nextDayBtn.disabled = viewDate >= todayKey();
    nextDayBtn.style.opacity = viewDate >= todayKey() ? 0.3 : 1;

    caloriesConsumedEl.textContent = consumed.toLocaleString();
    caloriesRemainingEl.textContent = remaining.toLocaleString();
    calorieGoalEl.textContent = state.goal.toLocaleString();

    updateRing(consumed, state.goal);

    goalInput.value = state.goal;

    if (calendarOpen) {
      const parts = viewDate.split("-").map(Number);
      calYear = parts[0];
      calMonth = parts[1] - 1;
      renderCalendar();
    }

    entriesList.innerHTML = "";
    if (entries.length === 0) {
      noEntries.classList.remove("hidden");
    } else {
      noEntries.classList.add("hidden");
      entries
        .slice()
        .reverse()
        .forEach((entry) => {
          const li = document.createElement("li");
          li.className = "entry-item";
          li.innerHTML =
            '<div class="entry-info">' +
            '<div class="entry-name">' +
            escapeHtml(entry.name) +
            "</div>" +
            '<div class="entry-time">' +
            formatTime(entry.time) +
            "</div>" +
            "</div>" +
            '<div class="entry-right">' +
            '<div class="entry-calories">' +
            entry.calories +
            " cal</div>" +
            '<button class="btn-delete" type="button" aria-label="Delete" data-id="' +
            entry.id +
            '">×</button>' +
            "</div>";
          entriesList.appendChild(li);
        });
    }
  }

  // -----------------------------
  // Event handlers: entries
  // -----------------------------
  entryForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = foodNameInput.value.trim();
    const calories = parseInt(foodCaloriesInput.value, 10);
    if (!name || !calories || calories <= 0) return;

    const entries = getEntries(viewDate);
    entries.push({
      id: generateId(),
      name,
      calories,
      time: new Date().toISOString()
    });
    setEntries(viewDate, entries);

    foodNameInput.value = "";
    foodCaloriesInput.value = "";
    foodNameInput.focus();
    render();
  });

  entriesList.addEventListener("click", function (e) {
    const btn = e.target.closest(".btn-delete");
    if (!btn) return;
    const id = btn.dataset.id;
    const entries = getEntries(viewDate).filter((entry) => entry.id !== id);
    setEntries(viewDate, entries);
    render();
  });

  clearAllBtn.addEventListener("click", function () {
    const entries = getEntries(viewDate);
    if (entries.length === 0) return;
    if (!confirm("Clear all entries for " + formatDisplayDate(viewDate) + "?")) return;
    setEntries(viewDate, []);
    render();
  });

  prevDayBtn.addEventListener("click", function () {
    viewDate = shiftDate(viewDate, -1);
    render();
  });

  nextDayBtn.addEventListener("click", function () {
    if (viewDate >= todayKey()) return;
    viewDate = shiftDate(viewDate, 1);
    render();
  });

  goalInput.addEventListener("change", function () {
    const val = parseInt(goalInput.value, 10);
    if (val && val >= 500 && val <= 10000) {
      state.goal = val;
      saveState();
      render();
    } else {
      goalInput.value = state.goal;
    }
  });

  // -----------------------------
  // Calendar
  // -----------------------------
  function renderCalendar() {
    const monthNames = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];
    calMonthLabel.textContent = monthNames[calMonth] + " " + calYear;

    const now = new Date();
    const isFutureMonth = calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth >= now.getMonth());
    nextMonthBtn.disabled = isFutureMonth;
    nextMonthBtn.style.opacity = isFutureMonth ? 0.3 : 1;

    calDaysContainer.innerHTML = "";
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayStr = todayKey();

    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement("div");
      empty.className = "cal-cell cal-empty";
      calDaysContainer.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey =
        calYear +
        "-" +
        String(calMonth + 1).padStart(2, "0") +
        "-" +
        String(d).padStart(2, "0");

      const cell = document.createElement("div");
      cell.className = "cal-cell";

      if (dateKey > todayStr) {
        cell.classList.add("cal-future");
      } else {
        cell.dataset.date = dateKey;
      }

      if (dateKey === todayStr) cell.classList.add("cal-today");
      if (dateKey === viewDate) cell.classList.add("cal-selected");

      const dayNum = document.createElement("span");
      dayNum.className = "cal-day-num";
      dayNum.textContent = d;
      cell.appendChild(dayNum);

      const entries = getEntries(dateKey);
      if (entries.length > 0 && dateKey <= todayStr) {
        const total = entries.reduce((sum, e) => sum + e.calories, 0);
        const cals = document.createElement("span");
        cals.className = "cal-day-cals";
        if (total > state.goal) cals.classList.add("cal-over");
        else cals.classList.add("cal-under");
        cals.textContent = total;
        cell.appendChild(cals);
        cell.classList.add("cal-has-data");
      }

      calDaysContainer.appendChild(cell);
    }
  }

  function toggleCalendar() {
    calendarOpen = !calendarOpen;
    if (calendarOpen) {
      calendarSection.classList.remove("hidden");
      toggleCalBtn.classList.add("active");
      const parts = viewDate.split("-").map(Number);
      calYear = parts[0];
      calMonth = parts[1] - 1;
      renderCalendar();
    } else {
      calendarSection.classList.add("hidden");
      toggleCalBtn.classList.remove("active");
    }
  }

  toggleCalBtn.addEventListener("click", toggleCalendar);

  prevMonthBtn.addEventListener("click", function () {
    calMonth--;
    if (calMonth < 0) {
      calMonth = 11;
      calYear--;
    }
    renderCalendar();
  });

  nextMonthBtn.addEventListener("click", function () {
    const now = new Date();
    if (calYear === now.getFullYear() && calMonth >= now.getMonth()) return;
    calMonth++;
    if (calMonth > 11) {
      calMonth = 0;
      calYear++;
    }
    renderCalendar();
  });

  calDaysContainer.addEventListener("click", function (e) {
    const cell = e.target.closest(".cal-cell[data-date]");
    if (!cell) return;
    viewDate = cell.dataset.date;
    calendarOpen = false;
    calendarSection.classList.add("hidden");
    toggleCalBtn.classList.remove("active");
    render();
  });

  // -----------------------------
  // Barcode + Open Food Facts
  // -----------------------------
  function setBarcodeStatus(msg, isError) {
    barcodeStatus.textContent = msg || "";
    barcodeStatus.classList.toggle("error", !!isError);
  }

  async function lookupBarcode(barcode) {
    const cleaned = String(barcode || "").replace(/\D/g, "");
    if (!cleaned) {
      setBarcodeStatus("Enter a barcode number first.", true);
      return;
    }

    setBarcodeStatus("Looking up product...", false);

    try {
      const url = "https://world.openfoodfacts.net/api/v2/product/" + encodeURIComponent(cleaned) + ".json";
      const res = await fetch(url, { cache: "no-store" });

      if (!res.ok) {
        setBarcodeStatus("Lookup failed (" + res.status + "). Try again.", true);
        return;
      }

      const data = await res.json();
      if (!data || data.status !== 1 || !data.product) {
        setBarcodeStatus("Product not found in Open Food Facts.", true);
        return;
      }

      const p = data.product;
      const name = (p.product_name || p.generic_name || "Scanned item").trim();

      // Calories can appear in multiple places depending on the product.
      const n = p.nutriments || {};
      const kcalPerServing = numOrNull(n["energy-kcal_serving"]) || numOrNull(n["energy-kcal"]) || null;
      const kcalPer100g = numOrNull(n["energy-kcal_100g"]) || null;

      if (kcalPerServing != null) {
        foodNameInput.value = name;
        foodCaloriesInput.value = Math.round(kcalPerServing);
        setBarcodeStatus("Found: " + name + " (per serving).", false);
        foodCaloriesInput.focus();
        return;
      }

      if (kcalPer100g != null) {
        let grams = prompt("Calories are per 100g. How many grams did you eat?", "100");
        if (grams == null) {
          setBarcodeStatus("Found: " + name + " (per 100g). Enter grams to calculate.", false);
          return;
        }
        grams = parseFloat(String(grams).replace(/[^0-9.]/g, ""));
        if (!grams || grams <= 0) {
          setBarcodeStatus("Invalid grams amount. Try again.", true);
          return;
        }
        const cals = (kcalPer100g * grams) / 100;
        foodNameInput.value = name;
        foodCaloriesInput.value = Math.round(cals);
        setBarcodeStatus("Found: " + name + " (" + grams + "g).", false);
        foodCaloriesInput.focus();
        return;
      }

      foodNameInput.value = name;
      setBarcodeStatus("Found product name, but calories are missing. Enter calories manually.", true);
      foodNameInput.focus();
    } catch (err) {
      setBarcodeStatus("Lookup error. Check your connection and try again.", true);
    }
  }

  function numOrNull(v) {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return Number.isFinite(n) ? n : null;
  }

  barcodeLookupBtn.addEventListener("click", function () {
    lookupBarcode(barcodeInput.value);
  });

  barcodeInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupBarcode(barcodeInput.value);
    }
  });

  // -----------------------------
  // Barcode scanning (Safari-compatible via ZXing)
  // -----------------------------
  function openScanner() {
    scannerModal.classList.remove("hidden");
    setBarcodeStatus("", false);
  }

  function closeScanner() {
    scannerModal.classList.add("hidden");

    try {
      if (scanControls && typeof scanControls.stop === "function") scanControls.stop();
    } catch (e) {}

    scanControls = null;

    try {
      if (codeReader && typeof codeReader.reset === "function") codeReader.reset();
    } catch (e) {}

    codeReader = null;

    // Ensure camera stream stops (iOS can be sticky)
    try {
      const stream = scannerVideo.srcObject;
      if (stream && stream.getTracks) stream.getTracks().forEach((t) => t.stop());
    } catch (e) {}
    scannerVideo.srcObject = null;
  }

  async function startScan() {
    if (!window.ZXingBrowser || !ZXingBrowser.BrowserMultiFormatReader) {
      setBarcodeStatus("Scanner library did not load. Try refreshing.", true);
      return;
    }

    openScanner();

    try {
      codeReader = new ZXingBrowser.BrowserMultiFormatReader();

      // Prefer back camera on phones
      const constraints = { video: { facingMode: { ideal: "environment" } } };

      scanControls = await codeReader.decodeFromConstraints(constraints, scannerVideo, (result, error, controls) => {
        if (result) {
          const text = result.getText ? result.getText() : String(result.text || "");
          if (text) {
            barcodeInput.value = text.replace(/\D/g, "");
            setBarcodeStatus("Scanned: " + barcodeInput.value, false);
            // Stop scanning immediately
            try { controls.stop(); } catch (e) {}
            closeScanner();
            lookupBarcode(barcodeInput.value);
          }
        }
      });
    } catch (err) {
      closeScanner();
      setBarcodeStatus(
        "Camera access failed. Make sure Safari has camera permission for this site.",
        true
      );
    }
  }

  barcodeScanBtn.addEventListener("click", startScan);
  scannerCloseBtn.addEventListener("click", closeScanner);
  scannerModal.addEventListener("click", function (e) {
    if (e.target === scannerModal) closeScanner();
  });

  // -----------------------------
  // Service worker
  // -----------------------------
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }

  // -----------------------------
  // Init
  // -----------------------------
  render();
})();
