const STORAGE_KEY = "fittrack_entries";
const GOALS_KEY = "fittrack_goals";

const DEFAULT_GOALS = { steps: 10000, calories: 500, minutes: 30 };

// ---------- Firebase (optional cloud sync) ----------
const FIREBASE_ENABLED =
  typeof firebaseConfig !== "undefined" &&
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("YOUR_");

let fbAuth = null;
let fbDb = null;
let currentUser = null;
let unsubEntries = null;
let unsubGoals = null;

if (FIREBASE_ENABLED) {
  firebase.initializeApp(firebaseConfig);
  fbAuth = firebase.auth();
  fbDb = firebase.firestore();
}

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadGoals() {
  try {
    return { ...DEFAULT_GOALS, ...(JSON.parse(localStorage.getItem(GOALS_KEY)) || {}) };
  } catch {
    return { ...DEFAULT_GOALS };
  }
}

function saveGoals(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function last7Dates() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function formatDateLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

// ---------- Tabs ----------
function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "dashboard") renderDashboard();
      if (btn.dataset.tab === "history") renderHistory();
    });
  });
}

// ---------- Log Form ----------
function initLogForm() {
  const form = document.getElementById("logForm");
  const dateInput = document.getElementById("entryDate");
  dateInput.value = todayISO();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = document.getElementById("formMessage");

    const entry = {
      id: Date.now().toString(),
      date: dateInput.value || todayISO(),
      type: document.getElementById("activityType").value,
      steps: Number(document.getElementById("entrySteps").value) || 0,
      duration: Number(document.getElementById("entryDuration").value) || 0,
      calories: Number(document.getElementById("entryCalories").value) || 0,
      notes: document.getElementById("entryNotes").value.trim(),
    };

    if (!entry.type) {
      msg.textContent = "Please select an activity type.";
      msg.className = "form-message error";
      return;
    }
    if (!entry.steps && !entry.duration && !entry.calories) {
      msg.textContent = "Enter at least one of steps, duration, or calories.";
      msg.className = "form-message error";
      return;
    }

    const entries = loadEntries();
    entries.push(entry);
    saveEntries(entries);
    syncEntryUp(entry);

    msg.textContent = "Entry saved!";
    msg.className = "form-message";
    form.reset();
    dateInput.value = todayISO();

    renderDashboard();
    renderHistory();
    setTimeout(() => (msg.textContent = ""), 2500);
  });
}

// ---------- Goals Form ----------
function initGoalsForm() {
  const goals = loadGoals();
  document.getElementById("goalSteps").value = goals.steps;
  document.getElementById("goalCalories").value = goals.calories;
  document.getElementById("goalMinutes").value = goals.minutes;

  document.getElementById("goalsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const newGoals = {
      steps: Number(document.getElementById("goalSteps").value) || DEFAULT_GOALS.steps,
      calories: Number(document.getElementById("goalCalories").value) || DEFAULT_GOALS.calories,
      minutes: Number(document.getElementById("goalMinutes").value) || DEFAULT_GOALS.minutes,
    };
    saveGoals(newGoals);
    syncGoalsUp(newGoals);
    const msg = document.getElementById("goalsMessage");
    msg.textContent = "Goals updated!";
    setTimeout(() => (msg.textContent = ""), 2000);
    renderDashboard();
  });
}

// ---------- History ----------
function renderHistory(filter = "") {
  const list = document.getElementById("historyList");
  const entries = loadEntries()
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id));

  const filtered = entries.filter((e) => {
    const q = filter.toLowerCase();
    return !q || e.type.toLowerCase().includes(q) || (e.notes || "").toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">No activities logged yet. Head to "Log Activity" to add one.</div>`;
    return;
  }

  list.innerHTML = filtered
    .map(
      (e) => `
    <div class="history-item" data-id="${e.id}">
      <div class="hi-main">
        <div class="hi-title">${escapeHtml(e.type)}</div>
        <div class="hi-meta">${e.date}</div>
        ${e.notes ? `<div class="hi-notes">${escapeHtml(e.notes)}</div>` : ""}
      </div>
      <div class="hi-stats">
        ${e.steps ? `<span><strong>${e.steps}</strong> steps</span>` : ""}
        ${e.duration ? `<span><strong>${e.duration}</strong> min</span>` : ""}
        ${e.calories ? `<span><strong>${e.calories}</strong> kcal</span>` : ""}
      </div>
      <button class="hi-delete" title="Delete entry" data-id="${e.id}">✕</button>
    </div>
  `
    )
    .join("");

  list.querySelectorAll(".hi-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const remaining = loadEntries().filter((e) => e.id !== id);
      saveEntries(remaining);
      syncEntryDeleteUp(id);
      renderHistory(document.getElementById("historySearch").value);
      renderDashboard();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function initHistoryControls() {
  document.getElementById("historySearch").addEventListener("input", (e) => {
    renderHistory(e.target.value);
  });
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    if (confirm("This will delete all logged activities. Continue?")) {
      const entries = loadEntries();
      saveEntries([]);
      syncEntriesClearUp(entries);
      renderHistory();
      renderDashboard();
    }
  });
}

// ---------- Dashboard ----------
let weeklyCaloriesChart, weeklyStepsChart, activityBreakdownChart;

function renderDashboard() {
  const entries = loadEntries();
  const goals = loadGoals();
  const today = todayISO();

  document.getElementById("todayDate").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const todaysEntries = entries.filter((e) => e.date === today);
  const stepsToday = todaysEntries.reduce((s, e) => s + e.steps, 0);
  const caloriesToday = todaysEntries.reduce((s, e) => s + e.calories, 0);
  const minutesToday = todaysEntries.reduce((s, e) => s + e.duration, 0);

  document.getElementById("stepsToday").textContent = stepsToday.toLocaleString();
  document.getElementById("caloriesToday").textContent = caloriesToday.toLocaleString();
  document.getElementById("minutesToday").textContent = minutesToday.toLocaleString();
  document.getElementById("workoutsToday").textContent = todaysEntries.length;

  setProgress("stepsProgress", "stepsGoalLabel", stepsToday, goals.steps, "steps");
  setProgress("caloriesProgress", "caloriesGoalLabel", caloriesToday, goals.calories, "kcal");
  setProgress("minutesProgress", "minutesGoalLabel", minutesToday, goals.minutes, "min");

  renderWeeklyCharts(entries);
}

function setProgress(barId, labelId, value, goal, unit) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  document.getElementById(barId).style.width = pct + "%";
  document.getElementById(labelId).textContent = `${value.toLocaleString()} / ${goal.toLocaleString()} ${unit} (${pct}%)`;
}

function renderWeeklyCharts(entries) {
  const dates = last7Dates();
  const labels = dates.map(formatDateLabel);

  const caloriesByDay = dates.map((d) =>
    entries.filter((e) => e.date === d).reduce((s, e) => s + e.calories, 0)
  );
  const stepsByDay = dates.map((d) =>
    entries.filter((e) => e.date === d).reduce((s, e) => s + e.steps, 0)
  );

  const recentEntries = entries.filter((e) => dates.includes(e.date));
  const byType = {};
  recentEntries.forEach((e) => {
    byType[e.type] = (byType[e.type] || 0) + e.duration;
  });
  const typeLabels = Object.keys(byType);
  const typeValues = Object.values(byType);

  const chartColors = ["#4f46e5", "#f97316", "#10b981", "#e11d48", "#0ea5e9", "#a855f7", "#eab308", "#14b8a6"];

  const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const gridColor = isDark ? "#262b36" : "#e5e7eb";
  const textColor = isDark ? "#9aa1ad" : "#6b7280";

  Chart.defaults.color = textColor;
  Chart.defaults.borderColor = gridColor;

  if (weeklyCaloriesChart) weeklyCaloriesChart.destroy();
  weeklyCaloriesChart = new Chart(document.getElementById("weeklyCaloriesChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Calories",
          data: caloriesByDay,
          backgroundColor: "#f97316",
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });

  if (weeklyStepsChart) weeklyStepsChart.destroy();
  weeklyStepsChart = new Chart(document.getElementById("weeklyStepsChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Steps",
          data: stepsByDay,
          borderColor: "#4f46e5",
          backgroundColor: "rgba(79,70,229,0.15)",
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });

  if (activityBreakdownChart) activityBreakdownChart.destroy();
  const breakdownCtx = document.getElementById("activityBreakdownChart");
  if (typeLabels.length === 0) {
    activityBreakdownChart = null;
    breakdownCtx.getContext("2d").clearRect(0, 0, breakdownCtx.width, breakdownCtx.height);
  } else {
    activityBreakdownChart = new Chart(breakdownCtx, {
      type: "doughnut",
      data: {
        labels: typeLabels,
        datasets: [
          {
            data: typeValues,
            backgroundColor: typeLabels.map((_, i) => chartColors[i % chartColors.length]),
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "right" } },
      },
    });
  }
}

// ---------- Motivational Quotes ----------
const QUOTES = [
  { text: "The only bad workout is the one that didn't happen.", author: "Unknown" },
  { text: "Take care of your body. It's the only place you have to live.", author: "Jim Rohn" },
  { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { text: "The pain you feel today will be the strength you feel tomorrow.", author: "Arnold Schwarzenegger" },
  { text: "Fitness is not about being better than someone else. It's about being better than you used to be.", author: "Khloe Kardashian" },
  { text: "Strength does not come from the body. It comes from the will.", author: "Mahatma Gandhi" },
  { text: "The only way to define your limits is by going beyond them.", author: "Arthur C. Clarke" },
  { text: "You don't have to be extreme, just consistent.", author: "Unknown" },
  { text: "A one hour workout is 4% of your day. No excuses.", author: "Unknown" },
  { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
];

let lastQuoteIndex = -1;

function showRandomQuote() {
  let idx = Math.floor(Math.random() * QUOTES.length);
  if (QUOTES.length > 1 && idx === lastQuoteIndex) {
    idx = (idx + 1) % QUOTES.length;
  }
  lastQuoteIndex = idx;
  const q = QUOTES[idx];
  document.getElementById("quoteText").textContent = `"${q.text}"`;
  document.getElementById("quoteAuthor").textContent = `— ${q.author}`;
}

function initQuote() {
  showRandomQuote();
  document.getElementById("newQuoteBtn").addEventListener("click", showRandomQuote);
}

// ---------- Auth & Cloud Sync ----------
function initAuth() {
  const overlay = document.getElementById("authOverlay");

  if (!FIREBASE_ENABLED) {
    overlay.style.display = "none";
    return;
  }

  let authMode = "signin";
  document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      authMode = btn.dataset.authtab;
      document.getElementById("authSubmitBtn").textContent = authMode === "signin" ? "Sign In" : "Sign Up";
      document.getElementById("authMessage").textContent = "";
    });
  });

  document.getElementById("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const msg = document.getElementById("authMessage");
    msg.textContent = "";
    msg.className = "form-message";
    try {
      if (authMode === "signin") {
        await fbAuth.signInWithEmailAndPassword(email, password);
      } else {
        await fbAuth.createUserWithEmailAndPassword(email, password);
      }
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "form-message error";
    }
  });

  document.querySelectorAll(".auth-method-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".auth-method-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const method = btn.dataset.authmethod;
      document.getElementById("emailAuthSection").style.display = method === "email" ? "block" : "none";
      document.getElementById("phoneAuthSection").style.display = method === "phone" ? "block" : "none";
    });
  });

  let confirmationResult = null;

  function getRecaptchaVerifier() {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier("recaptchaContainer", {
        size: "invisible",
      });
    }
    return window.recaptchaVerifier;
  }

  document.getElementById("phoneNumberForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const phone = document.getElementById("authPhone").value.trim();
    const msg = document.getElementById("phoneAuthMessage");
    msg.textContent = "";
    msg.className = "form-message";
    try {
      const verifier = getRecaptchaVerifier();
      confirmationResult = await fbAuth.signInWithPhoneNumber(phone, verifier);
      document.getElementById("phoneNumberForm").style.display = "none";
      document.getElementById("phoneOtpForm").style.display = "block";
      msg.textContent = "OTP sent. Enter the code below.";
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "form-message error";
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    }
  });

  document.getElementById("phoneOtpForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("authOtp").value.trim();
    const msg = document.getElementById("phoneAuthMessage");
    msg.textContent = "";
    msg.className = "form-message";
    try {
      await confirmationResult.confirm(code);
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "form-message error";
    }
  });

  document.getElementById("changeNumberBtn").addEventListener("click", () => {
    document.getElementById("phoneOtpForm").style.display = "none";
    document.getElementById("phoneNumberForm").style.display = "block";
    document.getElementById("authOtp").value = "";
    document.getElementById("phoneAuthMessage").textContent = "";
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = null;
    }
  });

  document.getElementById("continueLocalBtn").addEventListener("click", () => {
    sessionStorage.setItem("fittrack_local_mode", "1");
    overlay.style.display = "none";
  });

  document.getElementById("signOutBtn").addEventListener("click", () => {
    fbAuth.signOut();
  });

  fbAuth.onAuthStateChanged((user) => {
    currentUser = user;
    const syncStatus = document.getElementById("syncStatus");

    if (user) {
      overlay.style.display = "none";
      syncStatus.style.display = "flex";
      document.getElementById("syncStatusText").textContent = `Synced as ${user.email || user.phoneNumber}`;
      attachFirestoreListeners(user.uid);
    } else {
      syncStatus.style.display = "none";
      detachFirestoreListeners();
      overlay.style.display = sessionStorage.getItem("fittrack_local_mode") ? "none" : "flex";
      document.getElementById("phoneOtpForm").style.display = "none";
      document.getElementById("phoneNumberForm").style.display = "block";
      document.getElementById("authPhone").value = "";
      document.getElementById("authOtp").value = "";
      document.getElementById("phoneAuthMessage").textContent = "";
    }
  });
}

function attachFirestoreListeners(uid) {
  detachFirestoreListeners();

  unsubEntries = fbDb
    .collection("users")
    .doc(uid)
    .collection("entries")
    .onSnapshot((snap) => {
      const entries = [];
      snap.forEach((doc) => entries.push({ ...doc.data(), id: doc.id }));
      saveEntries(entries);
      renderDashboard();
      renderHistory(document.getElementById("historySearch").value);
    });

  unsubGoals = fbDb
    .collection("users")
    .doc(uid)
    .collection("settings")
    .doc("goals")
    .onSnapshot((doc) => {
      if (doc.exists) {
        const goals = doc.data();
        saveGoals(goals);
        document.getElementById("goalSteps").value = goals.steps;
        document.getElementById("goalCalories").value = goals.calories;
        document.getElementById("goalMinutes").value = goals.minutes;
        renderDashboard();
      }
    });
}

function detachFirestoreListeners() {
  if (unsubEntries) { unsubEntries(); unsubEntries = null; }
  if (unsubGoals) { unsubGoals(); unsubGoals = null; }
}

function syncEntryUp(entry) {
  if (FIREBASE_ENABLED && currentUser) {
    fbDb.collection("users").doc(currentUser.uid).collection("entries").doc(entry.id).set(entry).catch(console.error);
  }
}

function syncEntryDeleteUp(id) {
  if (FIREBASE_ENABLED && currentUser) {
    fbDb.collection("users").doc(currentUser.uid).collection("entries").doc(id).delete().catch(console.error);
  }
}

function syncEntriesClearUp(entries) {
  if (FIREBASE_ENABLED && currentUser && entries.length) {
    const batch = fbDb.batch();
    entries.forEach((e) => {
      batch.delete(fbDb.collection("users").doc(currentUser.uid).collection("entries").doc(e.id));
    });
    batch.commit().catch(console.error);
  }
}

function syncGoalsUp(goals) {
  if (FIREBASE_ENABLED && currentUser) {
    fbDb.collection("users").doc(currentUser.uid).collection("settings").doc("goals").set(goals).catch(console.error);
  }
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initLogForm();
  initGoalsForm();
  initHistoryControls();
  initQuote();
  initAuth();
  renderDashboard();
  renderHistory();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(console.error);
  });
}
