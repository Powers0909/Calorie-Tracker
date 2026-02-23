/* Calorie Tracker AI Logger
   Local-only storage + optional AI logging via /api/agent (Netlify Function).
*/
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "ct_ai_logger_v1";

const DEFAULTS = {
  goals: { cals: 2200, protein: 160, carbs: 220, fat: 70 },
  days: {},
  templates: []
};

function todayKey(date = new Date()){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function formatLong(date = new Date()){
  return date.toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric", year:"numeric" });
}
function timeLabel(ts){
  return new Date(ts).toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });
}
function uid(){
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now()) + Math.random().toString(16).slice(2);
}
function clampInt(n){
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}
function parseIntSafe(v){
  const n = Number(String(v ?? "").replace(/[^0-9]/g, ""));
  return clampInt(n);
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(DEFAULTS);
    const s = JSON.parse(raw);
    s.goals = s.goals || {};
    s.goals.cals = clampInt(Number(s.goals.cals ?? DEFAULTS.goals.cals)) || DEFAULTS.goals.cals;
    s.goals.protein = clampInt(Number(s.goals.protein ?? DEFAULTS.goals.protein));
    s.goals.carbs = clampInt(Number(s.goals.carbs ?? DEFAULTS.goals.carbs));
    s.goals.fat = clampInt(Number(s.goals.fat ?? DEFAULTS.goals.fat));
    s.days = s.days || {};
    s.templates = Array.isArray(s.templates) ? s.templates : [];
    return s;
  }catch{
    return structuredClone(DEFAULTS);
  }
}
function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function ensureDay(state, key){
  if(!state.days[key]) state.days[key] = { entries: [] };
}
function entriesFor(state, key){
  ensureDay(state, key);
  return state.days[key].entries || [];
}
function totalsFor(state, key){
  const entries = entriesFor(state, key);
  let cals=0, p=0, c=0, f=0;
  for(const e of entries){
    cals += Number(e.cals || 0);
    p += Number(e.protein || 0);
    c += Number(e.carbs || 0);
    f += Number(e.fat || 0);
  }
  return { cals: clampInt(cals), protein: clampInt(p), carbs: clampInt(c), fat: clampInt(f), count: entries.length };
}
function computeStreak(state){
  let streak = 0;
  const d = new Date();
  while(true){
    const key = todayKey(d);
    const cnt = (state.days[key]?.entries || []).length;
    if(!cnt) break;
    streak += 1;
    d.setDate(d.getDate()-1);
  }
  return streak;
}
function pct(now, goal){
  if(!goal) return 0;
  return Math.max(0, Math.min(100, (now/goal)*100));
}
function setBar(id, now, goal){
  $(id).style.width = pct(now, goal).toFixed(1) + "%";
}

function openModal(el){ el.hidden = false; }
function closeModal(el){ el.hidden = true; }

let editingEntry = null;
let proposed = null;

function render(state){
  const dKey = todayKey();
  ensureDay(state, dKey);

  $("todayLabel").textContent = formatLong(new Date());

  const goals = state.goals;
  const totals = totalsFor(state, dKey);

  $("goalCals").textContent = goals.cals;
  $("eatenCals").textContent = totals.cals;
  $("remainingCals").textContent = Math.max(0, goals.cals - totals.cals);

  $("pNow").textContent = totals.protein;
  $("cNow").textContent = totals.carbs;
  $("fNow").textContent = totals.fat;
  $("pGoal").textContent = goals.protein;
  $("cGoal").textContent = goals.carbs;
  $("fGoal").textContent = goals.fat;

  setBar("pBar", totals.protein, goals.protein);
  setBar("cBar", totals.carbs, goals.carbs);
  setBar("fBar", totals.fat, goals.fat);

  const streak = computeStreak(state);
  $("streakPill").textContent = `${streak} day streak`;

  const list = $("entriesList");
  const empty = $("emptyState");
  list.innerHTML = "";

  const entries = entriesFor(state, dKey);
  $("countLabel").textContent = `${entries.length} item${entries.length === 1 ? "" : "s"}`;

  if(!entries.length){
    empty.hidden = false;
  }else{
    empty.hidden = true;
    for(const e of entries.slice().reverse()){
      const li = document.createElement("li");
      li.className = "item";

      const metaParts = [];
      if(e.protein) metaParts.push(`P ${e.protein}g`);
      if(e.carbs) metaParts.push(`C ${e.carbs}g`);
      if(e.fat) metaParts.push(`F ${e.fat}g`);
      metaParts.push(timeLabel(e.ts));

      li.innerHTML = `
        <div class="itemLeft">
          <div class="itemName"></div>
          <div class="itemMeta"></div>
        </div>
        <div class="itemRight">
          <div class="kcal">${clampInt(Number(e.cals||0))} kcal</div>
          <button class="iconBtn" title="Edit">✎</button>
          <button class="iconBtn" title="Delete">✕</button>
        </div>
      `;
      li.querySelector(".itemName").textContent = e.name || "Food";
      li.querySelector(".itemMeta").textContent = metaParts.join(" • ");

      const [editBtn, delBtn] = li.querySelectorAll("button");
      editBtn.addEventListener("click", () => openEditEntry(state, dKey, e));
      delBtn.addEventListener("click", () => {
        const idx = state.days[dKey].entries.findIndex(x => x.id === e.id);
        if(idx >= 0){
          state.days[dKey].entries.splice(idx, 1);
          saveState(state);
          render(state);
        }
      });

      list.appendChild(li);
    }
  }
}

function openEditEntry(state, dayKey, entry){
  editingEntry = { dayKey, entryId: entry.id };
  $("addTitle").textContent = "Edit entry";
  $("foodInput").value = entry.name || "";
  $("calInput").value = entry.cals ? String(entry.cals) : "";
  $("proteinInput").value = entry.protein ? String(entry.protein) : "";
  $("carbInput").value = entry.carbs ? String(entry.carbs) : "";
  $("fatInput").value = entry.fat ? String(entry.fat) : "";
  openModal($("addModal"));
}

function openNewEntry(){
  editingEntry = null;
  $("addTitle").textContent = "Add food";
  $("foodInput").value = "";
  $("calInput").value = "";
  $("proteinInput").value = "";
  $("carbInput").value = "";
  $("fatInput").value = "";
  openModal($("addModal"));
}

function saveEntryFromModal(state){
  const name = $("foodInput").value.trim() || "Food";
  const cals = parseIntSafe($("calInput").value);
  const protein = parseIntSafe($("proteinInput").value);
  const carbs = parseIntSafe($("carbInput").value);
  const fat = parseIntSafe($("fatInput").value);

  const dKey = todayKey();
  ensureDay(state, dKey);

  if(editingEntry){
    const arr = state.days[editingEntry.dayKey].entries;
    const idx = arr.findIndex(x => x.id === editingEntry.entryId);
    if(idx >= 0){
      arr[idx] = { ...arr[idx], name, cals, protein, carbs, fat };
    }
  }else{
    state.days[dKey].entries.push({ id: uid(), name, cals, protein, carbs, fat, ts: Date.now() });
  }

  saveState(state);
  closeModal($("addModal"));
  render(state);
}

function renderTemplates(state, filter=""){
  const list = $("templatesList");
  list.innerHTML = "";
  const q = filter.trim().toLowerCase();

  const items = state.templates
    .slice()
    .sort((a,b) => (a.name||"").localeCompare(b.name||""))
    .filter(t => !q || (t.name||"").toLowerCase().includes(q));

  if(!items.length){
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = q ? "No matches." : "No templates yet.";
    list.appendChild(div);
    return;
  }

  for(const t of items){
    const row = document.createElement("div");
    row.className = "templateRow";
    const metaParts = [];
    if(t.protein) metaParts.push(`P ${t.protein}g`);
    if(t.carbs) metaParts.push(`C ${t.carbs}g`);
    if(t.fat) metaParts.push(`F ${t.fat}g`);
    metaParts.push(`${t.cals||0} kcal`);

    row.innerHTML = `
      <div class="templateLeft">
        <div class="templateName"></div>
        <div class="templateMeta"></div>
      </div>
      <div class="templateRight">
        <button class="btn ghost" title="Add">Add</button>
      </div>
    `;
    row.querySelector(".templateName").textContent = t.name || "Template";
    row.querySelector(".templateMeta").textContent = metaParts.join(" • ");

    row.querySelector("button").addEventListener("click", () => {
      const dKey = todayKey();
      ensureDay(state, dKey);
      state.days[dKey].entries.push({
        id: uid(),
        name: t.name || "Food",
        cals: clampInt(Number(t.cals||0)),
        protein: clampInt(Number(t.protein||0)),
        carbs: clampInt(Number(t.carbs||0)),
        fat: clampInt(Number(t.fat||0)),
        ts: Date.now()
      });
      saveState(state);
      render(state);
      closeModal($("templatesModal"));
    });

    let pressTimer = null;
    const startPress = () => {
      pressTimer = setTimeout(() => {
        const action = prompt("Type: edit or delete", "edit");
        if(!action) return;
        if(action.toLowerCase().startsWith("d")){
          if(confirm("Delete template?")){
            state.templates = state.templates.filter(x => x.id !== t.id);
            saveState(state);
            renderTemplates(state, $("templateSearch").value);
          }
        }else{
          const name = prompt("Template name", t.name || "") ?? t.name;
          const cals = parseIntSafe(prompt("Calories", String(t.cals||0)) ?? String(t.cals||0));
          const p = parseIntSafe(prompt("Protein (g)", String(t.protein||0)) ?? String(t.protein||0));
          const c = parseIntSafe(prompt("Carbs (g)", String(t.carbs||0)) ?? String(t.carbs||0));
          const f = parseIntSafe(prompt("Fat (g)", String(t.fat||0)) ?? String(t.fat||0));
          state.templates = state.templates.map(x => x.id === t.id ? { ...x, name, cals, protein:p, carbs:c, fat:f } : x);
          saveState(state);
          renderTemplates(state, $("templateSearch").value);
        }
      }, 650);
    };
    const endPress = () => { if(pressTimer) clearTimeout(pressTimer); pressTimer = null; };
    row.addEventListener("pointerdown", startPress);
    row.addEventListener("pointerup", endPress);
    row.addEventListener("pointerleave", endPress);
    row.addEventListener("pointercancel", endPress);

    list.appendChild(row);
  }
}

function addTemplate(state){
  const name = prompt("Template name", "My food");
  if(!name) return;
  const cals = parseIntSafe(prompt("Calories", "0") || "0");
  const p = parseIntSafe(prompt("Protein (g)", "0") || "0");
  const c = parseIntSafe(prompt("Carbs (g)", "0") || "0");
  const f = parseIntSafe(prompt("Fat (g)", "0") || "0");
  state.templates.push({ id: uid(), name, cals, protein:p, carbs:c, fat:f });
  saveState(state);
  renderTemplates(state, $("templateSearch").value);
}

function renderHistory(state){
  const list = $("historyList");
  list.innerHTML = "";

  const now = new Date();
  for(let i=0;i<14;i++){
    const d = new Date(now);
    d.setDate(now.getDate()-i);
    const key = todayKey(d);
    const totals = totalsFor(state, key);

    const wrap = document.createElement("div");
    wrap.className = "historyDay";

    const pills = [];
    pills.push(`<span class="pillMini">${totals.cals} kcal</span>`);
    if(state.goals.protein) pills.push(`<span class="pillMini">P ${totals.protein}g</span>`);
    if(state.goals.carbs) pills.push(`<span class="pillMini">C ${totals.carbs}g</span>`);
    if(state.goals.fat) pills.push(`<span class="pillMini">F ${totals.fat}g</span>`);

    wrap.innerHTML = `
      <div class="historyDayTop">
        <div class="historyTitle">${d.toLocaleDateString(undefined,{weekday:"short", month:"short", day:"numeric"})}</div>
        <div class="historyTotals">${pills.join("")}</div>
      </div>
      <div class="muted">${totals.count} item${totals.count===1?"":"s"}</div>
    `;
    list.appendChild(wrap);
  }
}

function exportData(state){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `calorie-tracker-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

async function importFile(file){
  const txt = await file.text();
  const parsed = JSON.parse(txt);
  if(!parsed || typeof parsed !== "object") throw new Error("Bad file");
  const next = structuredClone(DEFAULTS);
  next.goals = parsed.goals || next.goals;
  next.days = parsed.days || {};
  next.templates = Array.isArray(parsed.templates) ? parsed.templates : [];
  next.goals = {
    cals: clampInt(Number(next.goals.cals ?? DEFAULTS.goals.cals)) || DEFAULTS.goals.cals,
    protein: clampInt(Number(next.goals.protein ?? DEFAULTS.goals.protein)),
    carbs: clampInt(Number(next.goals.carbs ?? DEFAULTS.goals.carbs)),
    fat: clampInt(Number(next.goals.fat ?? DEFAULTS.goals.fat)),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function showProposed(items, notes){
  proposed = { items, notes: notes || "" };
  $("proposeSummary").textContent = notes || "Review items before adding.";
  const list = $("proposeList");
  list.innerHTML = "";
  for(const it of items){
    const li = document.createElement("li");
    li.className = "item";
    const metaParts = [];
    if(it.protein) metaParts.push(`P ${it.protein}g`);
    if(it.carbs) metaParts.push(`C ${it.carbs}g`);
    if(it.fat) metaParts.push(`F ${it.fat}g`);
    li.innerHTML = `
      <div class="itemLeft">
        <div class="itemName"></div>
        <div class="itemMeta">${metaParts.join(" • ") || " "}</div>
      </div>
      <div class="itemRight">
        <div class="kcal">${it.cals||0} kcal</div>
      </div>
    `;
    li.querySelector(".itemName").textContent = it.name || "Food";
    list.appendChild(li);
  }
  openModal($("proposeModal"));
}

function applyProposed(state){
  if(!proposed || !proposed.items?.length) return;
  const dKey = todayKey();
  ensureDay(state, dKey);
  for(const it of proposed.items){
    state.days[dKey].entries.push({
      id: uid(),
      name: it.name || "Food",
      cals: clampInt(Number(it.cals||0)),
      protein: clampInt(Number(it.protein||0)),
      carbs: clampInt(Number(it.carbs||0)),
      fat: clampInt(Number(it.fat||0)),
      ts: Date.now()
    });
  }
  proposed = null;
  saveState(state);
  closeModal($("proposeModal"));
  render(state);
}

async function aiLog(state, text){
  const hint = $("loggerHint");
  const btn = $("loggerBtn");
  const input = $("loggerInput");
  const msg = text.trim();
  if(!msg) return;

  btn.disabled = true;
  btn.textContent = "Logging...";
  hint.textContent = "Contacting agent...";

  try{
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        message: msg,
        date: todayKey(),
        goals: state.goals,
        recent: entriesFor(state, todayKey()).slice(-10),
        templates: state.templates.slice(0, 50)
      })
    });

    if(!res.ok){
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if(!data || !Array.isArray(data.items) || !data.items.length){
      hint.textContent = "No items detected. Try being more specific.";
      return;
    }
    showProposed(data.items, data.notes || "Confirm these entries.");
    input.value = "";
    hint.textContent = "Ready.";
  }catch{
    hint.textContent = "AI logging failed. If you deployed with Netlify Drop, functions will not run.";
  }finally{
    btn.disabled = false;
    btn.textContent = "Log";
  }
}

function main(){
  let state = loadState();
  ensureDay(state, todayKey());
  saveState(state);

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("installBtn").hidden = false;
    $("installBtn").addEventListener("click", async () => {
      $("installBtn").hidden = true;
      if(!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }, { once:true });
  });

  $("openAddBtn").addEventListener("click", openNewEntry);
  $("closeAddBtn").addEventListener("click", () => closeModal($("addModal")));
  $("cancelEntryBtn").addEventListener("click", () => closeModal($("addModal")));
  $("saveEntryBtn").addEventListener("click", () => saveEntryFromModal(state));

  $("openTemplatesBtn").addEventListener("click", () => { renderTemplates(state, $("templateSearch").value); openModal($("templatesModal")); });
  $("closeTemplatesBtn").addEventListener("click", () => closeModal($("templatesModal")));
  $("addTemplateBtn").addEventListener("click", () => addTemplate(state));
  $("templateSearch").addEventListener("input", (e) => renderTemplates(state, e.target.value));

  $("openHistoryBtn").addEventListener("click", () => { renderHistory(state); openModal($("historyModal")); });
  $("closeHistoryBtn").addEventListener("click", () => closeModal($("historyModal")));
  $("jumpTodayBtn").addEventListener("click", () => closeModal($("historyModal")));

  $("openSettingsBtn").addEventListener("click", () => {
    $("goalInput").value = String(state.goals.cals || "");
    $("goalProteinInput").value = String(state.goals.protein || "");
    $("goalCarbInput").value = String(state.goals.carbs || "");
    $("goalFatInput").value = String(state.goals.fat || "");
    openModal($("settingsModal"));
  });
  $("closeSettingsBtn").addEventListener("click", () => closeModal($("settingsModal")));
  $("saveGoalsBtn").addEventListener("click", () => {
    state.goals = {
      cals: parseIntSafe($("goalInput").value) || 2200,
      protein: parseIntSafe($("goalProteinInput").value),
      carbs: parseIntSafe($("goalCarbInput").value),
      fat: parseIntSafe($("goalFatInput").value),
    };
    saveState(state);
    closeModal($("settingsModal"));
    render(state);
  });
  $("resetDefaultsBtn").addEventListener("click", () => {
    if(!confirm("Reset goals to defaults?")) return;
    state.goals = structuredClone(DEFAULTS.goals);
    saveState(state);
    closeModal($("settingsModal"));
    render(state);
  });

  $("clearTodayBtn").addEventListener("click", () => {
    if(!confirm("Clear all entries for today?")) return;
    const k = todayKey();
    ensureDay(state, k);
    state.days[k].entries = [];
    saveState(state);
    render(state);
  });

  $("exportBtn").addEventListener("click", () => exportData(state));
  $("importInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    try{
      state = await importFile(file);
      saveState(state);
      render(state);
      alert("Import complete.");
    }catch{
      alert("Import failed. Make sure it is a valid backup JSON.");
    }finally{
      e.target.value = "";
    }
  });

  $("closeProposeBtn").addEventListener("click", () => { proposed=null; closeModal($("proposeModal")); });
  $("cancelProposeBtn").addEventListener("click", () => { proposed=null; closeModal($("proposeModal")); });
  $("confirmProposeBtn").addEventListener("click", () => applyProposed(state));

  $("loggerBtn").addEventListener("click", () => aiLog(state, $("loggerInput").value));
  $("loggerInput").addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      e.preventDefault();
      aiLog(state, $("loggerInput").value);
    }
  });

  render(state);

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
main();
