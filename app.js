(function () {
  "use strict";

  // ── State ──
  const STORAGE_KEY = "calorie-tracker-data";
  let state = loadState();
  let viewDate = todayKey();

  // ── DOM refs ──
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
  const barcodeInput = document.getElementById("barcode");
  const lookupBtn = document.getElementById("btn-lookup");
  const scanBtn = document.getElementById("btn-scan");
  const barcodePhotoInput = document.getElementById("barcode-photo");
  const lookupStatusEl = document.getElementById("lookup-status");
  const entriesList = document.getElementById("entries-list");
  const noEntries = document.getElementById("no-entries");
  const clearAllBtn = document.getElementById("clear-all");
  const goalInput = document.getElementById("goal-input");
  const toggleCalBtn = document.getElementById("toggle-calendar");
  const calendarSection = document.getElementById("calendar-section");
  const calMonthLabel = document.getElementById("cal-month-label");
  const prevMonthBtn = document.getElementById("prev-month");
  const nextMonthBtn = document.getElementById("next-month");
  const calDaysContainer = document.getElementById("cal-days");

  // ── Calendar state ──
  let calendarOpen = false;
  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth(); // 0-indexed

  // ── Helpers ──
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function formatDisplayDate(key) {
    const today = todayKey();
    if (key === today) return "Today";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.getFullYear() + "-" +
      String(yesterday.getMonth() + 1).padStart(2, "0") + "-" +
      String(yesterday.getDate()).padStart(2, "0");
    if (key === yKey) return "Yesterday";
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function shiftDate(key, delta) {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + delta);
    return date.getFullYear() + "-" +
      String(date.getMonth() + 1).padStart(2, "0") + "-" +
      String(date.getDate()).padStart(2, "0");
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  // ── Barcode lookup (Open Food Facts) ──
  function setLookupStatus(message, kind) {
    if (!lookupStatusEl) return;
    lookupStatusEl.textContent = message || "";
    lookupStatusEl.classList.remove("success", "error");
    if (kind) lookupStatusEl.classList.add(kind);
  }

  function normalizeBarcode(raw) {
    return String(raw || "").replace(/[^0-9]/g, "");
  }

  async function lookupBarcodeAndPrefill(barcode) {
    const code = normalizeBarcode(barcode);
    if (!code) {
      setLookupStatus("Enter a barcode first.", "error");
      return;
    }

    setLookupStatus("Looking up barcode...", null);

    // OFF endpoint docs:
    // https://world.openfoodfacts.net/api/v2/product/{barcode}
    const url =
      "https://world.openfoodfacts.net/api/v2/product/" +
      encodeURIComponent(code) +
      "?fields=product_name,brands,serving_size,nutriments";

    let data;
    try {
      const res = await fetch(url, { method: "GET" });
      data = await res.json();
    } catch (err) {
      setLookupStatus("Network error. Try again.", "error");
      return;
    }

    if (!data || data.status !== 1 || !data.product) {
      setLookupStatus("Not found in Open Food Facts.", "error");
      return;
    }

    const p = data.product;
    const nameBase = (p.product_name || "").trim();
    const brand = (p.brands || "").split(",")[0].trim();
    const displayName = (brand && nameBase) ? (brand + " " + nameBase) : (nameBase || brand || "Food");

    const nutr = p.nutriments || {};
    const kcalServing = Number(nutr["energy-kcal_serving"]);
    const kcal100g = Number(nutr["energy-kcal_100g"]);

    let calories = null;

    if (Number.isFinite(kcalServing) && kcalServing > 0) {
      calories = Math.round(kcalServing);
    } else if (Number.isFinite(kcal100g) && kcal100g > 0) {
      const serving = (p.serving_size || "").trim();
      const gramsStr = prompt(
        "This item has calories per 100g. Enter grams eaten" +
          (serving ? " (serving size: " + serving + ")" : "") +
          ":"
      );
      const grams = Number(String(gramsStr || "").replace(",", "."));
      if (!Number.isFinite(grams) || grams <= 0) {
        setLookupStatus("Cancelled. Enter calories manually or try again.", "error");
        return;
      }
      calories = Math.round((kcal100g * grams) / 100);
    } else {
      setLookupStatus("Found product, but calories are missing in the database.", "error");
      foodNameInput.value = displayName;
      foodCaloriesInput.value = "";
      foodCaloriesInput.focus();
      return;
    }

    foodNameInput.value = displayName;
    foodCaloriesInput.value = String(calories);
    foodCaloriesInput.focus();
    setLookupStatus("Filled from barcode.", "success");
  }

  async function scanBarcodeFromPhotoFile(file) {
    if (!file) return;

    if (!("BarcodeDetector" in window)) {
      setLookupStatus("Barcode scan is not supported on this browser. Type the barcode instead.", "error");
      return;
    }

    setLookupStatus("Scanning photo...", null);

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (err) {
      setLookupStatus("Could not read that photo. Try again.", "error");
      return;
    }

    let detector;
    try {
      detector = new BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"],
      });
    } catch (err) {
      setLookupStatus("Barcode scan is not supported on this device.", "error");
      return;
    }

    let codes = [];
    try {
      codes = await detector.detect(bitmap);
    } catch (err) {
      setLookupStatus("Could not detect a barcode. Try again with a clearer photo.", "error");
      return;
    }

    if (!codes || codes.length === 0) {
      setLookupStatus("No barcode detected. Try again closer and with good lighting.", "error");
      return;
    }

    const rawValue = codes[0].rawValue;
    const normalized = normalizeBarcode(rawValue);
    if (!normalized) {
      setLookupStatus("Barcode read failed. Try again.", "error");
      return;
    }

    barcodeInput.value = normalized;
    await lookupBarcodeAndPrefill(normalized);
  }


  // ── Persistence ──
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          goal: parsed.goal || 2000,
          days: parsed.days || {},
        };
      }
    } catch (e) {
      // ignore corrupt data
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
    if (entries.length === 0) {
      delete state.days[dateKey];
    } else {
      state.days[dateKey] = entries;
    }
    saveState();
  }

  // ── Ring animation ──
  const CIRCUMFERENCE = 2 * Math.PI * 52; // ~326.73

  function updateRing(consumed, goal) {
    const ratio = Math.min(consumed / goal, 1);
    const offset = CIRCUMFERENCE - ratio * CIRCUMFERENCE;
    ringFill.style.strokeDashoffset = offset;

    if (consumed > goal) {
      ringFill.classList.add("over");
    } else {
      ringFill.classList.remove("over");
    }
  }

  // ── Render ──
  function render() {
    const entries = getEntries(viewDate);
    const consumed = entries.reduce((sum, e) => sum + e.calories, 0);
    const remaining = Math.max(0, state.goal - consumed);

    // Date nav
    currentDateEl.textContent = formatDisplayDate(viewDate);
    nextDayBtn.disabled = viewDate >= todayKey();
    nextDayBtn.style.opacity = viewDate >= todayKey() ? 0.3 : 1;

    // Summary
    caloriesConsumedEl.textContent = consumed.toLocaleString();
    caloriesRemainingEl.textContent = remaining.toLocaleString();
    calorieGoalEl.textContent = state.goal.toLocaleString();
    updateRing(consumed, state.goal);

    // Goal input
    goalInput.value = state.goal;

    // Calendar refresh
    if (calendarOpen) {
      var parts = viewDate.split("-").map(Number);
      calYear = parts[0];
      calMonth = parts[1] - 1;
      renderCalendar();
    }

    // Entries list
    entriesList.innerHTML = "";
    if (entries.length === 0) {
      noEntries.classList.remove("hidden");
    } else {
      noEntries.classList.add("hidden");
      entries.slice().reverse().forEach(function (entry) {
        const li = document.createElement("li");
        li.className = "entry-item";
        li.innerHTML =
          '<div class="entry-info">' +
            '<span class="entry-name">' + escapeHtml(entry.name) + '</span>' +
            '<span class="entry-time">' + formatTime(entry.time) + '</span>' +
          '</div>' +
          '<div class="entry-right">' +
            '<span class="entry-calories">' + entry.calories + ' cal</span>' +
            '<button class="btn-delete" data-id="' + entry.id + '" title="Delete">&times;</button>' +
          '</div>';
        entriesList.appendChild(li);
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Event handlers ──
  entryForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = foodNameInput.value.trim();
    const calories = parseInt(foodCaloriesInput.value, 10);
    if (!name || !calories || calories <= 0) return;

    const entries = getEntries(viewDate);
    entries.push({
      id: generateId(),
      name: name,
      calories: calories,
      time: new Date().toISOString(),
    });
    setEntries(viewDate, entries);

    foodNameInput.value = "";
    foodCaloriesInput.value = "";
    foodNameInput.focus();
    render();
  });


  // Barcode buttons
  if (lookupBtn && barcodeInput) {
    lookupBtn.addEventListener("click", function () {
      lookupBarcodeAndPrefill(barcodeInput.value);
    });

    barcodeInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        lookupBarcodeAndPrefill(barcodeInput.value);
      }
    });
  }

  if (scanBtn && barcodePhotoInput) {
    scanBtn.addEventListener("click", function () {
      setLookupStatus("", null);
      barcodePhotoInput.value = "";
      barcodePhotoInput.click();
    });

    barcodePhotoInput.addEventListener("change", function () {
      const file = barcodePhotoInput.files && barcodePhotoInput.files[0];
      scanBarcodeFromPhotoFile(file);
    });
  }

  entriesList.addEventListener("click", function (e) {
    const btn = e.target.closest(".btn-delete");
    if (!btn) return;
    const id = btn.dataset.id;
    const entries = getEntries(viewDate).filter(function (entry) {
      return entry.id !== id;
    });
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

  // ── Calendar ──
  function renderCalendar() {
    var monthNames = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    calMonthLabel.textContent = monthNames[calMonth] + " " + calYear;

    // Disable next month if it would go past current month
    var now = new Date();
    var isCurrentMonth = calYear === now.getFullYear() && calMonth === now.getMonth();
    var isFutureMonth = calYear > now.getFullYear() ||
      (calYear === now.getFullYear() && calMonth >= now.getMonth());
    nextMonthBtn.disabled = isFutureMonth;
    nextMonthBtn.style.opacity = isFutureMonth ? 0.3 : 1;

    // Build day cells
    calDaysContainer.innerHTML = "";
    var firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sunday
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var todayStr = todayKey();

    // Empty cells for days before the 1st
    for (var i = 0; i < firstDay; i++) {
      var empty = document.createElement("div");
      empty.className = "cal-cell cal-empty";
      calDaysContainer.appendChild(empty);
    }

    // Day cells
    for (var d = 1; d <= daysInMonth; d++) {
      var dateKey = calYear + "-" +
        String(calMonth + 1).padStart(2, "0") + "-" +
        String(d).padStart(2, "0");

      var cell = document.createElement("div");
      cell.className = "cal-cell";

      // Don't allow selecting future dates
      if (dateKey > todayStr) {
        cell.classList.add("cal-future");
      } else {
        cell.dataset.date = dateKey;
      }

      if (dateKey === todayStr) cell.classList.add("cal-today");
      if (dateKey === viewDate) cell.classList.add("cal-selected");

      var dayNum = document.createElement("span");
      dayNum.className = "cal-day-num";
      dayNum.textContent = d;
      cell.appendChild(dayNum);

      // Show calorie total if entries exist
      var entries = getEntries(dateKey);
      if (entries.length > 0 && dateKey <= todayStr) {
        var total = entries.reduce(function (sum, e) { return sum + e.calories; }, 0);
        var cals = document.createElement("span");
        cals.className = "cal-day-cals";
        if (total > state.goal) {
          cals.classList.add("cal-over");
        } else {
          cals.classList.add("cal-under");
        }
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
      // Sync calendar to currently viewed date
      var parts = viewDate.split("-").map(Number);
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
    var now = new Date();
    if (calYear === now.getFullYear() && calMonth >= now.getMonth()) return;
    calMonth++;
    if (calMonth > 11) {
      calMonth = 0;
      calYear++;
    }
    renderCalendar();
  });

  calDaysContainer.addEventListener("click", function (e) {
    var cell = e.target.closest(".cal-cell[data-date]");
    if (!cell) return;
    viewDate = cell.dataset.date;
    calendarOpen = false;
    calendarSection.classList.add("hidden");
    toggleCalBtn.classList.remove("active");
    render();
  });

  // ── Service Worker registration ──
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }

  // ── Init ──
  render();
})();
