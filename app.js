import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
    import {
      getAuth,
      signInAnonymously
    } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
    import {
      getFirestore,
      collection,
      doc,
      addDoc,
      updateDoc,
      deleteDoc,
      onSnapshot,
      getDoc,
      getDocs,
      query,
      serverTimestamp
    } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

    const APP_VERSION = "2026.05.30.2";

    const firebaseConfig = {
      apiKey: "AIzaSyAMPfQ9gX9rbuvcPsVjYVtq5IT_orjDBPs",
      authDomain: "home-tasks-app-18de3.firebaseapp.com",
      projectId: "home-tasks-app-18de3",
      storageBucket: "home-tasks-app-18de3.firebasestorage.app",
      messagingSenderId: "253720858709",
      appId: "1:253720858709:web:b87e338d8f3fa399c384dc"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    const HOUSEHOLD_ID = "home";
    const householdPath = `households/${HOUSEHOLD_ID}`;

    const categoriesRef = collection(db, householdPath, "categories");
    const tasksRef = collection(db, householdPath, "tasks");
    const completionsRef = collection(db, householdPath, "completions");

    let state = {
      users: ["Espen", "Line"],
      categories: [],
      tasks: [],
      completions: []
    };

    let calendarMonthDate = new Date();
    let hasRenderedInitial = false;
    let selectedTaskId = null;

    function todayISO() {
      return new Date().toISOString().slice(0, 10);
    }

    function toDate(value) {
      const [year, month, day] = value.split("-").map(Number);
      return new Date(year, month - 1, day);
    }

    function toISO(date) {
      const clone = new Date(date);
      clone.setMinutes(clone.getMinutes() - clone.getTimezoneOffset());
      return clone.toISOString().slice(0, 10);
    }

    function startOfMonth(date = new Date()) {
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    function addMonths(date, amount) {
      return new Date(date.getFullYear(), date.getMonth() + amount, 1);
    }

    function addCalendarMonths(date, amount) {
      const target = new Date(date);
      const originalDay = target.getDate();
      target.setDate(1);
      target.setMonth(target.getMonth() + amount);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(originalDay, lastDay));
      return target;
    }

    function startOfISOWeek(date = new Date()) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      return d;
    }

    function endOfISOWeek(date = new Date()) {
      const start = startOfISOWeek(date);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return end;
    }

    function getWeekStartISO(date = new Date()) {
      return toISO(startOfISOWeek(date));
    }

    function getWeekEndISO(date = new Date()) {
      return toISO(endOfISOWeek(date));
    }

    function weeksBetween(startISO, endISO) {
      const start = startOfISOWeek(toDate(startISO));
      const end = startOfISOWeek(toDate(endISO));
      return Math.floor((end - start) / (7 * 24 * 60 * 60 * 1000));
    }

    function monthsBetween(startISO, endISO) {
      const start = toDate(startISO);
      const end = toDate(endISO);
      return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
    }

    function addDays(date, days) {
      const clone = new Date(date);
      clone.setDate(clone.getDate() + days);
      return clone;
    }

    function monthDayFromISO(iso) {
      return iso ? iso.slice(5) : "";
    }

    function dateInputValueFromMonthDay(monthDay) {
      if (!monthDay) return "";
      return `${new Date().getFullYear()}-${monthDay}`;
    }

    function formatMonthDay(monthDay) {
      if (!monthDay) return "";
      return new Intl.DateTimeFormat("no-NO", { day: "numeric", month: "short" })
        .format(toDate(`${new Date().getFullYear()}-${monthDay}`));
    }

    function isMonthDayInRange(monthDay, startMonthDay, endMonthDay) {
      if (!startMonthDay || !endMonthDay) return true;
      if (startMonthDay <= endMonthDay) {
        return monthDay >= startMonthDay && monthDay <= endMonthDay;
      }
      return monthDay >= startMonthDay || monthDay <= endMonthDay;
    }

    function isTaskInSeasonForWeek(task, weekStartISO) {
      if (!task.seasonStartMonthDay || !task.seasonEndMonthDay) return true;

      const weekStart = toDate(weekStartISO);
      for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
        const day = addDays(weekStart, dayOffset);
        const monthDay = toISO(day).slice(5);
        if (isMonthDayInRange(monthDay, task.seasonStartMonthDay, task.seasonEndMonthDay)) {
          return true;
        }
      }
      return false;
    }

    function shouldAppearThisWeek(task) {
      return Boolean(getTaskDueWeekStartISO(task));
    }

    function getTaskDueWeekStartISO(task, asOfDate = new Date()) {
      if (!task.isActive || !task.startDate) return null;

      const currentWeekStart = startOfISOWeek(asOfDate);
      const currentWeekStartISO = toISO(currentWeekStart);
      const taskStartWeek = startOfISOWeek(toDate(task.startDate));
      if (taskStartWeek > currentWeekStart) return null;

      const latestCompletion = getLatestCompletion(task.id);

      if (!latestCompletion) {
        for (let weekStart = new Date(taskStartWeek); weekStart <= currentWeekStart; weekStart = addDays(weekStart, 7)) {
          const weekStartISO = toISO(weekStart);
          if (isTaskScheduledForWeek(task, weekStartISO)) return weekStartISO;
        }
        return null;
      }

      const completionDateISO = latestCompletion.completedAt.slice(0, 10);
      const completedWeekStart = startOfISOWeek(toDate(completionDateISO));

      if (latestCompletion.weekStartDate === currentWeekStartISO) {
        return currentWeekStartISO;
      }

      for (let weekStart = addDays(completedWeekStart, 7); weekStart <= currentWeekStart; weekStart = addDays(weekStart, 7)) {
        const weekStartISO = toISO(weekStart);
        if (!isTaskInSeasonForWeek(task, weekStartISO)) continue;
        if (isFrequencyDue(task, completionDateISO, weekStartISO)) return weekStartISO;
      }

      return null;
    }

    function isFrequencyDue(task, referenceDateISO, currentWeekStartISO) {
      const referenceDate = toDate(referenceDateISO);
      const currentWeekEnd = endOfISOWeek(toDate(currentWeekStartISO));

      if (task.frequencyType === "weekly") return addDays(referenceDate, 7) <= currentWeekEnd;
      if (task.frequencyType === "biweekly") return addDays(referenceDate, 14) <= currentWeekEnd;
      if (task.frequencyType === "customWeeks") return addDays(referenceDate, Math.max(1, Number(task.customIntervalWeeks || 1)) * 7) <= currentWeekEnd;
      if (task.frequencyType === "monthly") return addCalendarMonths(referenceDate, 1) <= currentWeekEnd;
      if (task.frequencyType === "semiannual") return addCalendarMonths(referenceDate, 6) <= currentWeekEnd;
      return true;
    }

    function getLatestCompletion(taskId) {
      return state.completions
        .filter(c => c.taskId === taskId)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
    }

    function isCompletedThisWeek(taskId) {
      const weekStart = getWeekStartISO();
      return state.completions.some(c => c.taskId === taskId && c.weekStartDate === weekStart);
    }

    function isCompletedInWeek(taskId, weekStartISO) {
      return state.completions.some(c => c.taskId === taskId && c.weekStartDate === weekStartISO);
    }

    function getCompletionThisWeek(taskId) {
      const weekStart = getWeekStartISO();
      return state.completions.find(c => c.taskId === taskId && c.weekStartDate === weekStart);
    }

    function getTaskCompletions(taskId) {
      return state.completions
        .filter(c => c.taskId === taskId)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    }

    function frequencyLabel(task) {
      const map = {
        weekly: "Ukentlig",
        biweekly: "Annenhver uke",
        monthly: "Månedlig",
        semiannual: "Halvårlig",
        customWeeks: `Hver ${task.customIntervalWeeks || "?"}. uke`
      };
      return map[task.frequencyType] || task.frequencyType;
    }

    function assignedLabel(task) {
      if (!task.assignedTo || task.assignedTo.length === 0) return "Begge";
      return task.assignedTo.join(" + ");
    }

    function seasonLabel(task) {
      if (!task.seasonStartMonthDay || !task.seasonEndMonthDay) return "Hele året";
      return `${formatMonthDay(task.seasonStartMonthDay)}–${formatMonthDay(task.seasonEndMonthDay)}`;
    }

    function taskStatusLabel(task) {
      if (!task.isActive) return "Deaktivert";
      if (isCompletedThisWeek(task.id)) return "Utført denne uken";
      const dueWeekStartISO = getTaskDueWeekStartISO(task);
      if (dueWeekStartISO && dueWeekStartISO < getWeekStartISO()) return "Forfalt";
      if (dueWeekStartISO) return "Klar denne uken";
      if (!isTaskInSeasonForWeek(task, getWeekStartISO())) return "Sesongpause";
      return "Planlagt";
    }

    function nextTaskOccurrenceLabel(task) {
      if (!task.isActive) return "Ikke aktiv";
      const dueWeekStartISO = getTaskDueWeekStartISO(task);
      if (dueWeekStartISO && !isCompletedThisWeek(task.id)) {
        return dueWeekStartISO < getWeekStartISO()
          ? `Forfalt fra uke ${getISOWeek(toDate(dueWeekStartISO))}: ${formatDate(dueWeekStartISO)}`
          : "Denne uken";
      }

      const latestCompletion = getLatestCompletion(task.id);
      const start = startOfISOWeek(new Date());

      for (let offset = 0; offset < 104; offset += 1) {
        const weekStart = addDays(start, offset * 7);
        const weekStartISO = toISO(weekStart);

        if (!isTaskInSeasonForWeek(task, weekStartISO)) continue;
        if (toDate(task.startDate) > endOfISOWeek(weekStart)) continue;

        const isDue = latestCompletion
          ? latestCompletion.weekStartDate !== weekStartISO && isFrequencyDue(task, latestCompletion.completedAt.slice(0, 10), weekStartISO)
          : isTaskScheduledForWeek(task, weekStartISO);

        if (isDue) {
          return `Uke ${getISOWeek(weekStart)}: ${formatDate(weekStartISO)}`;
        }
      }

      return "Ikke funnet i plan";
    }

    function getCategory(id) {
      return state.categories.find(c => c.id === id) || { name: "Ukjent", color: "#e8e2dc" };
    }

    function switchTab(tabId) {
      document.querySelectorAll(".tab-button, .bottom-tab, .icon-button").forEach(btn => {
        const isSetupChild = ["categories", "task-editor"].includes(tabId) && btn.dataset.tab === "setup";
        const isTasksChild = tabId === "task-detail" && btn.dataset.tab === "tasks";
        btn.classList.toggle("active", btn.dataset.tab === tabId || isSetupChild || isTasksChild);
      });
      document.querySelectorAll(".panel").forEach(panel => {
        panel.classList.toggle("active", panel.id === tabId);
      });
    }

    function openTaskForm() {
      resetTaskForm();
      switchTab("task-editor");
    }

    function renderAll() {
      renderWeekTitle();
      renderDashboard();
      renderCategories();
      renderCategoryOptions();
      renderTasks();
      renderCalendar();
      renderHistory();
      renderTaskDetail();
    }

    function renderWeekTitle() {
      const start = getWeekStartISO();
      const end = getWeekEndISO();
      document.getElementById("weekTitle").textContent = `Uke ${getISOWeek(new Date())} · ${formatShortDate(start)} - ${formatShortDate(end)}`;
    }

    function getISOWeek(date) {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    function formatDate(iso) {
      return new Intl.DateTimeFormat("no-NO", { day: "2-digit", month: "short", year: "numeric" }).format(toDate(iso));
    }

    function formatShortDate(iso) {
      return new Intl.DateTimeFormat("no-NO", { day: "numeric", month: "short" }).format(toDate(iso));
    }

    function renderDashboard() {
      const dueTasks = state.tasks.filter(shouldAppearThisWeek);
      const done = dueTasks.filter(t => isCompletedThisWeek(t.id));
      const remaining = dueTasks.length - done.length;

      document.getElementById("totalDue").textContent = dueTasks.length;
      document.getElementById("totalDone").textContent = done.length;
      document.getElementById("totalRemaining").textContent = remaining;

      const container = document.getElementById("dashboardTasks");
      const visibleTasks = dueTasks.filter(task => !isCompletedThisWeek(task.id));

      if (dueTasks.length === 0) {
        container.innerHTML = `<div class="empty-state">Ingen oppgaver denne uken. Legg til en ny oppgave for å komme i gang.</div>`;
        return;
      }

      if (visibleTasks.length === 0) {
        container.innerHTML = `<div class="empty-state">Alle oppgaver for denne uken er utført. Du kan angre utførelse fra Historikk-fanen.</div>`;
        return;
      }

      container.innerHTML = visibleTasks
        .sort((a, b) => {
          const dueA = getTaskDueWeekStartISO(a) || "";
          const dueB = getTaskDueWeekStartISO(b) || "";
          if (dueA !== dueB) return dueA.localeCompare(dueB);
          return a.title.localeCompare(b.title, "no-NO");
        })
        .map(task => renderTaskCard(task, { dashboard: true }))
        .join("");
    }

    function renderTasks() {
      const container = document.getElementById("allTasks");
      const activeTasks = state.tasks.filter(t => t.isActive);
      const viewMode = document.getElementById("taskViewMode")?.value || "category";
      const categoryFilter = document.getElementById("taskCategoryFilter")?.value || "all";
      const meta = document.getElementById("taskListMeta");

      if (activeTasks.length === 0) {
        container.innerHTML = `<div class="empty-state">Ingen aktive oppgaver ennå.</div>`;
        if (meta) meta.textContent = "";
        return;
      }

      const visibleTasks = activeTasks.filter(task => {
        return categoryFilter === "all" || task.categoryId === categoryFilter;
      });

      if (meta) {
        meta.textContent = visibleTasks.length === activeTasks.length
          ? `${visibleTasks.length} aktive oppgaver`
          : `${visibleTasks.length} av ${activeTasks.length} aktive oppgaver`;
      }

      if (visibleTasks.length === 0) {
        container.innerHTML = `<div class="empty-state">Ingen oppgaver matcher filteret.</div>`;
        return;
      }

      if (viewMode === "alphabetical") {
        container.innerHTML = sortTasksByTitle(visibleTasks)
          .map(task => renderTaskCard(task, { compact: true }))
          .join("");
        return;
      }

      if (viewMode === "frequency") {
        container.innerHTML = buildFrequencyGroups(visibleTasks)
          .map(group => renderTaskGroup(group.title, group.tasks))
          .join("");
        return;
      }

      container.innerHTML = buildCategoryGroups(visibleTasks)
        .map(group => renderTaskGroup(group.title, group.tasks, group.color))
        .join("");
    }

    function sortTasksByTitle(tasks) {
      return [...tasks].sort((a, b) => a.title.localeCompare(b.title, "no-NO"));
    }

    function taskCountLabel(count) {
      return count === 1 ? "1 oppgave" : `${count} oppgaver`;
    }

    function renderTaskGroup(title, tasks, color) {
      return `
        <section class="task-group">
          <div class="task-group-header">
            <div class="task-group-title">
              ${color ? `<span class="dot" style="background:${color}"></span>` : ""}
              <h3>${escapeHtml(title)}</h3>
            </div>
            <span class="task-group-count">${taskCountLabel(tasks.length)}</span>
          </div>
          <div class="task-list">
            ${sortTasksByTitle(tasks)
              .map(task => renderTaskCard(task, { compact: true }))
              .join("")}
          </div>
        </section>`;
    }

    function buildCategoryGroups(tasks) {
      const groups = new Map();

      tasks.forEach(task => {
        const category = getCategory(task.categoryId);
        const key = task.categoryId || "unknown";
        if (!groups.has(key)) {
          groups.set(key, { title: category.name, color: category.color, tasks: [] });
        }
        groups.get(key).tasks.push(task);
      });

      return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, "no-NO"));
    }

    function buildFrequencyGroups(tasks) {
      const order = ["weekly", "biweekly", "customWeeks", "monthly", "semiannual", "other"];
      const groups = new Map();

      tasks.forEach(task => {
        const key = task.frequencyType === "customWeeks"
          ? `customWeeks-${task.customIntervalWeeks || 1}`
          : task.frequencyType || "other";
        if (!groups.has(key)) {
          groups.set(key, {
            title: frequencyLabel(task),
            orderKey: task.frequencyType || "other",
            tasks: []
          });
        }
        groups.get(key).tasks.push(task);
      });

      return [...groups.values()].sort((a, b) => {
        const orderA = order.indexOf(a.orderKey);
        const orderB = order.indexOf(b.orderKey);
        const normalizedA = orderA === -1 ? order.length : orderA;
        const normalizedB = orderB === -1 ? order.length : orderB;
        if (normalizedA !== normalizedB) return normalizedA - normalizedB;
        return a.title.localeCompare(b.title, "no-NO");
      });
    }

    function renderTaskCard(task, options = {}) {
      const category = getCategory(task.categoryId);
      const completed = isCompletedThisWeek(task.id);
      const completion = getCompletionThisWeek(task.id);
      const doneText = completion ? `Utført av ${completion.completedBy}` : "Ikke utført";
      const hasSeason = task.seasonStartMonthDay && task.seasonEndMonthDay;

      if (options.dashboard) {
        const dueWeekStartISO = getTaskDueWeekStartISO(task);
        const overdue = dueWeekStartISO && dueWeekStartISO < getWeekStartISO() && !completed;
        const statusText = overdue ? `Forfalt uke ${getISOWeek(toDate(dueWeekStartISO))}` : doneText;

        return `
        <article class="task-card dashboard-task ${completed ? "done" : ""} ${overdue ? "overdue" : ""}" onclick="openTaskDetail('${task.id}')">
          <input class="checkbox" type="checkbox" ${completed ? "checked" : ""} onclick="event.stopPropagation()" onchange="toggleComplete('${task.id}', this.checked)" aria-label="Marker ${escapeHtml(task.title)} som utført" />
          <div class="dashboard-task-main">
            <div class="dashboard-task-title-row">
              <h3 class="task-title">${escapeHtml(task.title)}</h3>
              <span class="dashboard-chevron" aria-hidden="true">›</span>
            </div>
            <div class="dashboard-meta">
              <span class="dashboard-category" style="--category-color:${category.color}">${escapeHtml(category.name)}</span>
              <span>${frequencyLabel(task)}</span>
              <span>${assignedLabel(task)}</span>
              ${hasSeason ? `<span>${seasonLabel(task)}</span>` : ""}
              <span class="${completed ? "dashboard-done" : "dashboard-open"}">${statusText}</span>
            </div>
          </div>
        </article>`;
      }

      if (options.compact) {
        return `
        <article class="task-card task-row" onclick="openTaskDetail('${task.id}')">
          <span class="dot" style="background:${category.color}"></span>
          <div class="task-row-main">
            <div class="dashboard-task-title-row">
              <h3 class="task-title">${escapeHtml(task.title)}</h3>
              <span class="dashboard-chevron" aria-hidden="true">›</span>
            </div>
            <div class="dashboard-meta">
              <span>${frequencyLabel(task)}</span>
              <span>${assignedLabel(task)}</span>
              ${hasSeason ? `<span>${seasonLabel(task)}</span>` : ""}
            </div>
          </div>
        </article>`;
      }

      return `
        <article class="task-card ${completed ? "done" : ""}">
          <span class="dot" style="background:${category.color}"></span>
          <div>
            <h3 class="task-title">${escapeHtml(task.title)}</h3>
            <p class="task-description">${escapeHtml(task.description || "Ingen beskrivelse")}</p>
            <div class="meta-row">
              <span class="pill" style="background:${category.color}33">${escapeHtml(category.name)}</span>
              <span class="pill purple">${frequencyLabel(task)}</span>
              <span class="pill pink">${assignedLabel(task)}</span>
              ${hasSeason ? `<span class="pill">${seasonLabel(task)}</span>` : ""}
            </div>
          </div>
          <div class="actions">
            <button class="btn-light" onclick="openTaskDetail('${task.id}')">Detaljer</button>
            <button class="btn-light" onclick="editTask('${task.id}')">Rediger</button>
            <button class="btn-danger" onclick="deactivateTask('${task.id}')">Deaktiver</button>
          </div>
        </article>`;
    }

    function openTaskDetail(taskId) {
      selectedTaskId = taskId;
      renderTaskDetail();
      switchTab("task-detail");
    }

    function renderTaskDetail() {
      const title = document.getElementById("taskDetailTitle");
      const subtitle = document.getElementById("taskDetailSubtitle");
      const container = document.getElementById("taskDetailContent");
      if (!title || !subtitle || !container) return;

      const task = state.tasks.find(t => t.id === selectedTaskId);
      if (!task) {
        title.textContent = "Oppgave";
        subtitle.textContent = "Velg en oppgave for å se detaljer.";
        container.innerHTML = `<div class="empty-state">Ingen oppgave valgt.</div>`;
        return;
      }

      const category = getCategory(task.categoryId);
      const completions = getTaskCompletions(task.id);
      const latestCompletion = completions[0];
      const completedThisWeek = isCompletedThisWeek(task.id);
      const status = taskStatusLabel(task);

      title.textContent = task.title;
      subtitle.textContent = `${category.name} · ${status}`;

      container.innerHTML = `
        <div class="detail-layout">
          <article class="detail-hero">
            <div class="detail-title-row">
              <span class="dot" style="background:${category.color}"></span>
              <div>
                <h3>${escapeHtml(task.title)}</h3>
                <p>${escapeHtml(task.description || "Ingen beskrivelse")}</p>
              </div>
            </div>
            <div class="meta-row">
              <span class="pill" style="background:${category.color}33">${escapeHtml(category.name)}</span>
              <span class="pill purple">${frequencyLabel(task)}</span>
              <span class="pill pink">${assignedLabel(task)}</span>
              <span class="pill">${seasonLabel(task)}</span>
              <span class="pill ${completedThisWeek ? "pink" : "red"}">${status}</span>
            </div>
            <div class="detail-actions">
              ${completedThisWeek
                ? `<button class="btn-light" type="button" onclick="setTaskCompletionFromDetail('${task.id}', false)">Angre utført denne uken</button>`
                : `<button class="btn-primary" type="button" onclick="setTaskCompletionFromDetail('${task.id}', true)">Marker utført</button>`}
              <button class="btn-light" type="button" onclick="editTask('${task.id}')">Rediger</button>
              <button class="btn-danger" type="button" onclick="deactivateTask('${task.id}')">Deaktiver</button>
            </div>
          </article>

          <div class="detail-grid">
            ${renderDetailMetric("Status", status)}
            ${renderDetailMetric("Neste gang", nextTaskOccurrenceLabel(task))}
            ${renderDetailMetric("Sist utført", latestCompletion ? `${formatDate(latestCompletion.completedAt.slice(0, 10))} av ${escapeHtml(latestCompletion.completedBy)}` : "Ingen historikk")}
            ${renderDetailMetric("Første planlagte uke", formatDate(task.startDate))}
          </div>

          <article class="card">
            <h3 class="detail-section-title">Historikk for oppgaven</h3>
            ${renderTaskHistoryList(completions)}
          </article>
        </div>`;
    }

    function renderDetailMetric(label, value) {
      return `
        <div class="detail-metric">
          <span>${escapeHtml(label)}</span>
          <strong>${value}</strong>
        </div>`;
    }

    function renderTaskHistoryList(completions) {
      if (completions.length === 0) {
        return `<div class="empty-inline">Ingen utførelser registrert ennå.</div>`;
      }

      return `
        <div class="detail-history-list">
          ${completions.slice(0, 8).map(item => `
            <div class="detail-history-item">
              <div>
                <strong>${formatDate(item.completedAt.slice(0, 10))}</strong>
                <span>${new Date(item.completedAt).toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div>Utført av ${escapeHtml(item.completedBy)}</div>
              <button type="button" class="btn-light btn-small" onclick="undoCompletion('${item.id}')">Angre</button>
            </div>
          `).join("")}
        </div>`;
    }

    async function setTaskCompletionFromDetail(taskId, checked) {
      await toggleComplete(taskId, checked);
      selectedTaskId = taskId;
      renderAll();
    }

    async function toggleComplete(taskId, checked) {
      const currentUser = document.getElementById("currentUser").value;
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;

      const category = getCategory(task.categoryId);
      const weekStart = getWeekStartISO();
      const scheduledWeekStart = getTaskDueWeekStartISO(task) || weekStart;

      if (checked) {
        if (!isCompletedThisWeek(taskId)) {
          await addDoc(completionsRef, {
            taskId,
            taskTitleSnapshot: task.title,
            categoryNameSnapshot: category.name,
            completedBy: currentUser,
            completedAt: new Date().toISOString(),
            weekStartDate: weekStart,
            scheduledWeekStartDate: scheduledWeekStart,
            createdAt: serverTimestamp()
          });
        }
      } else {
        const completion = getCompletionThisWeek(taskId);
        if (completion) await deleteDoc(doc(db, "households", HOUSEHOLD_ID, "completions", completion.id));
      }
    }

    async function handleTaskSubmit(event) {
      event.preventDefault();

      const editingId = document.getElementById("editingTaskId").value;
      const editingTaskUpdatedAt = document.getElementById("editingTaskUpdatedAt").value;
      const assignedValue = document.getElementById("taskAssignedTo").value;
      const assignedTo = assignedValue === "both" ? ["Espen", "Line"] : [assignedValue];
      const isSeasonal = document.getElementById("taskSeasonMode").value === "seasonal";

      const taskData = {
        title: document.getElementById("taskTitle").value.trim(),
        description: document.getElementById("taskDescription").value.trim(),
        categoryId: document.getElementById("taskCategory").value,
        frequencyType: document.getElementById("taskFrequency").value,
        customIntervalWeeks: document.getElementById("taskFrequency").value === "customWeeks" ? Number(document.getElementById("customIntervalWeeks").value || 1) : null,
        startDate: document.getElementById("taskStartDate").value,
        seasonStartMonthDay: isSeasonal ? monthDayFromISO(document.getElementById("taskSeasonStart").value) : null,
        seasonEndMonthDay: isSeasonal ? monthDayFromISO(document.getElementById("taskSeasonEnd").value) : null,
        assignedTo,
        isActive: true,
        updatedAt: new Date().toISOString()
      };

      if (isSeasonal && (!taskData.seasonStartMonthDay || !taskData.seasonEndMonthDay)) {
        alert("Velg både fra-dato og til-dato for aktiv periode.");
        return;
      }

      if (editingId) {
        const taskRef = doc(db, "households", HOUSEHOLD_ID, "tasks", editingId);
        const latestTask = await getDoc(taskRef);
        const latestUpdatedAt = latestTask.exists() ? latestTask.data().updatedAt || "" : "";

        if (!latestTask.exists()) {
          alert("Denne oppgaven finnes ikke lenger. Oppgavelisten oppdateres nå.");
          resetTaskForm();
          switchTab("tasks");
          return;
        }

        if (latestUpdatedAt && editingTaskUpdatedAt && latestUpdatedAt !== editingTaskUpdatedAt) {
          alert("Denne oppgaven er endret av en annen enhet etter at du åpnet redigeringen. Oppdaterte data vises nå, så åpne oppgaven på nytt før du lagrer.");
          resetTaskForm();
          switchTab("tasks");
          return;
        }

        await updateDoc(taskRef, taskData);
      } else {
        await addDoc(tasksRef, {
          ...taskData,
          createdAt: new Date().toISOString()
        });
      }

      resetTaskForm();
      switchTab("tasks");
    }

    function editTask(taskId) {
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;

      document.getElementById("editingTaskId").value = task.id;
      document.getElementById("editingTaskUpdatedAt").value = task.updatedAt || "";
      document.getElementById("taskTitle").value = task.title;
      document.getElementById("taskDescription").value = task.description || "";
      document.getElementById("taskCategory").value = task.categoryId;
      document.getElementById("taskStartDate").value = task.startDate;
      document.getElementById("taskFrequency").value = task.frequencyType;
      document.getElementById("customIntervalWeeks").value = task.customIntervalWeeks || 3;
      document.getElementById("taskAssignedTo").value = task.assignedTo?.length === 1 ? task.assignedTo[0] : "both";
      document.getElementById("taskSeasonMode").value = task.seasonStartMonthDay && task.seasonEndMonthDay ? "seasonal" : "allYear";
      document.getElementById("taskSeasonStart").value = dateInputValueFromMonthDay(task.seasonStartMonthDay);
      document.getElementById("taskSeasonEnd").value = dateInputValueFromMonthDay(task.seasonEndMonthDay);
      document.getElementById("taskFormTitle").textContent = "Rediger oppgave";
      toggleCustomInterval();
      toggleSeasonFields();
      document.getElementById("cancelTaskEditBtn").style.display = "inline-flex";
      switchTab("task-editor");
    }

    async function deactivateTask(taskId) {
      if (!confirm("Vil du deaktivere denne oppgaven? Historikk beholdes.")) return;
      await updateDoc(doc(db, "households", HOUSEHOLD_ID, "tasks", taskId), {
        isActive: false,
        updatedAt: new Date().toISOString()
      });
    }

    function resetTaskForm() {
      document.getElementById("taskForm").reset();
      document.getElementById("editingTaskId").value = "";
      document.getElementById("editingTaskUpdatedAt").value = "";
      document.getElementById("taskStartDate").value = todayISO();
      document.getElementById("taskSeasonMode").value = "allYear";
      document.getElementById("taskSeasonStart").value = "";
      document.getElementById("taskSeasonEnd").value = "";
      document.getElementById("taskFormTitle").textContent = "Legg til oppgave";
      document.getElementById("cancelTaskEditBtn").style.display = "none";
      toggleCustomInterval();
      toggleSeasonFields();
    }

    function cancelTaskEdit() {
      resetTaskForm();
      switchTab("tasks");
    }

    function toggleCustomInterval() {
      const frequency = document.getElementById("taskFrequency").value;
      document.getElementById("customIntervalWrap").style.display = frequency === "customWeeks" ? "block" : "none";
    }

    function toggleSeasonFields() {
      const isSeasonal = document.getElementById("taskSeasonMode").value === "seasonal";
      document.getElementById("seasonStartWrap").style.display = isSeasonal ? "block" : "none";
      document.getElementById("seasonEndWrap").style.display = isSeasonal ? "block" : "none";
    }

    function selectCategoryColor(color) {
      document.getElementById("categoryColor").value = color;
      document.querySelectorAll(".color-swatch").forEach(swatch => {
        swatch.classList.toggle("active", swatch.dataset.color === color);
      });
    }

    async function handleCategorySubmit(event) {
      event.preventDefault();
      const name = document.getElementById("categoryName").value.trim();
      const color = document.getElementById("categoryColor").value;
      if (!name) return;

      await addDoc(categoriesRef, {
        name,
        color,
        isActive: true,
        createdAt: new Date().toISOString()
      });

      document.getElementById("categoryForm").reset();
      selectCategoryColor("#FF5A5F");
    }

    function renderCategories() {
      const container = document.getElementById("categoryList");
      const activeCategories = state.categories.filter(c => c.isActive);

      container.innerHTML = activeCategories.map(category => `
        <div class="category-card">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="dot" style="background:${category.color}"></span>
            <strong>${escapeHtml(category.name)}</strong>
          </div>
          <button class="btn-light" onclick="deleteCategory('${category.id}')">Fjern</button>
        </div>
      `).join("");
    }

    function renderCategoryOptions() {
      const select = document.getElementById("taskCategory");
      const currentValue = select.value;
      const activeCategories = state.categories
        .filter(c => c.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, "no-NO"));

      select.innerHTML = activeCategories
        .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join("");

      if (currentValue && activeCategories.some(c => c.id === currentValue)) {
        select.value = currentValue;
      }

      const filterSelect = document.getElementById("taskCategoryFilter");
      if (!filterSelect) return;

      const filterValue = filterSelect.value || "all";
      filterSelect.innerHTML = `
        <option value="all">Alle kategorier</option>
        ${activeCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
      `;

      if (filterValue === "all" || activeCategories.some(c => c.id === filterValue)) {
        filterSelect.value = filterValue;
      }
    }

    function changeCalendarMonth(direction) {
      calendarMonthDate = addMonths(calendarMonthDate, direction);
      renderCalendar();
    }

    function goToCurrentMonth() {
      calendarMonthDate = startOfMonth(new Date());
      renderCalendar();
    }

    function isTaskScheduledForWeek(task, weekStartISO) {
      if (!task.isActive || !task.startDate) return false;
      if (!isTaskInSeasonForWeek(task, weekStartISO)) return false;

      const taskStartWeekISO = getWeekStartISO(toDate(task.startDate));
      if (toDate(weekStartISO) < toDate(taskStartWeekISO)) return false;

      const weekDistance = weeksBetween(taskStartWeekISO, weekStartISO);

      if (task.frequencyType === "weekly") return true;
      if (task.frequencyType === "biweekly") return weekDistance % 2 === 0;
      if (task.frequencyType === "customWeeks") {
        const interval = Math.max(1, Number(task.customIntervalWeeks || 1));
        return weekDistance % interval === 0;
      }

      if (task.frequencyType === "monthly" || task.frequencyType === "semiannual") {
        const monthDistance = monthsBetween(task.startDate, weekStartISO);
        const interval = task.frequencyType === "semiannual" ? 6 : 1;
        if (monthDistance < 0 || monthDistance % interval !== 0) return false;

        const occurrence = new Date(toDate(task.startDate));
        occurrence.setMonth(occurrence.getMonth() + monthDistance);
        return getWeekStartISO(occurrence) === weekStartISO;
      }

      return false;
    }

    function getCalendarTasksForWeek(weekStartDate) {
      const weekStartISO = toISO(weekStartDate);
      return state.tasks
        .filter(task => isTaskScheduledForWeek(task, weekStartISO))
        .sort((a, b) => a.title.localeCompare(b.title));
    }

    function renderCalendar() {
      const title = document.getElementById("calendarMonthTitle");
      const grid = document.getElementById("calendarGrid");
      if (!title || !grid) return;

      const monthStart = startOfMonth(calendarMonthDate);
      const monthLabel = new Intl.DateTimeFormat("no-NO", { month: "long", year: "numeric" }).format(monthStart);
      title.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

      const firstWeekStart = startOfISOWeek(monthStart);
      const lastWeekStart = startOfISOWeek(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0));
      const weekStarts = [];
      for (let weekStart = firstWeekStart; weekStart <= lastWeekStart; weekStart = addDays(weekStart, 7)) {
        weekStarts.push(new Date(weekStart));
      }

      const currentWeekStartISO = getWeekStartISO();

      grid.innerHTML = weekStarts.map(weekStart => {
        const weekStartISO = toISO(weekStart);
        const weekEnd = addDays(weekStart, 6);
        const tasks = getCalendarTasksForWeek(weekStart);
        const visibleTasks = tasks.slice(0, 8);
        const hiddenCount = tasks.length - visibleTasks.length;
        const weekTouchesCurrentMonth = weekStart.getMonth() === monthStart.getMonth() || weekEnd.getMonth() === monthStart.getMonth();
        const rowClasses = [
          "calendar-week-row",
          weekTouchesCurrentMonth ? "" : "muted",
          weekStartISO === currentWeekStartISO ? "current" : ""
        ].filter(Boolean).join(" ");

        return `
          <div class="${rowClasses}">
            <div class="calendar-week-label">
              <div class="calendar-week-number">Uke ${getISOWeek(weekStart)}</div>
              <div class="calendar-week-dates">${formatDate(weekStartISO)} - ${formatDate(toISO(weekEnd))}</div>
            </div>
            <div class="calendar-items">
              ${visibleTasks.length ? visibleTasks.map(task => {
                const category = getCategory(task.categoryId);
                const completed = isCompletedInWeek(task.id, weekStartISO);
                return `<div class="calendar-item ${completed ? "done" : ""}" style="background:${category.color}33">${escapeHtml(task.title)}</div>`;
              }).join("") : `<div class="calendar-empty-week">Ingen planlagte oppgaver</div>`}
              ${hiddenCount > 0 ? `<div class="calendar-more">+${hiddenCount} flere</div>` : ""}
            </div>
          </div>`;
      }).join("");
    }

    async function deleteCategory(categoryId) {
      const hasTasks = state.tasks.some(t => t.categoryId === categoryId && t.isActive);
      if (hasTasks) {
        alert("Denne kategorien brukes av aktive oppgaver. Endre oppgavene først.");
        return;
      }
      await updateDoc(doc(db, "households", HOUSEHOLD_ID, "categories", categoryId), { isActive: false });
    }

    function renderHistory() {
      const table = document.getElementById("historyTable");
      if (state.completions.length === 0) {
        table.innerHTML = `<tr><td colspan="6">Ingen historikk ennå.</td></tr>`;
        return;
      }

      table.innerHTML = [...state.completions]
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
        .map(item => `
          <tr>
            <td>${formatDate(item.completedAt.slice(0, 10))}<br><span class="subtitle">${new Date(item.completedAt).toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })}</span></td>
            <td><strong>${escapeHtml(item.taskTitleSnapshot)}</strong></td>
            <td>${escapeHtml(item.categoryNameSnapshot)}</td>
            <td>${escapeHtml(item.completedBy)}</td>
            <td>${formatDate(item.weekStartDate)}</td>
            <td><button type="button" class="btn-light" onclick="undoCompletion('${item.id}')">Angre utført</button></td>
          </tr>
        `).join("");
    }

    async function undoCompletion(completionId) {
      if (!confirm("Vil du angre denne utførelsen? Oppgaven vil dukke opp på dashboardet igjen hvis den fortsatt gjelder denne uken.")) return;

      try {
        await deleteDoc(doc(db, "households", HOUSEHOLD_ID, "completions", completionId));
      } catch (error) {
        console.error("Kunne ikke angre utførelse:", error);
        alert("Klarte ikke å angre utførelsen. Sjekk at Firestore Rules fortsatt tillater sletting.");
      }
    }

    async function clearHistory() {
      if (!confirm("Vil du tømme all historikk? Dette påvirker også hvilke oppgaver som regnes som utført.")) return;
      const snapshot = await getDocs(completionsRef);
      await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));
    }

    async function refreshApp() {
      try {
        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        }

        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(registration => registration.unregister()));
        }
      } catch (error) {
        console.warn("Kunne ikke tømme mellomlager før oppdatering:", error);
      }

      const url = new URL(window.location.href);
      url.searchParams.set("appVersion", Date.now().toString());
      window.location.replace(url.toString());
    }

    async function checkForAppUpdate() {
      try {
        const response = await fetch(`./app-version.json?ts=${Date.now()}`, {
          cache: "no-store"
        });
        if (!response.ok) return;

        const latest = await response.json();
        if (latest.version && latest.version !== APP_VERSION) {
          document.getElementById("updatePrompt")?.removeAttribute("hidden");
        }
      } catch (error) {
        console.warn("Kunne ikke sjekke appversjon:", error);
      }
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    async function seedDefaultCategoriesIfNeeded() {
      const snapshot = await getDocs(categoriesRef);
      if (!snapshot.empty) return;

      const defaults = [
        { name: "Kjøkken", color: "#FF5A5F", isActive: true },
        { name: "Bad", color: "#ffd7d7", isActive: true },
        { name: "Klesvask", color: "#6B4EFF", isActive: true },
        { name: "Annet", color: "#e8e2dc", isActive: true }
      ];

      await Promise.all(defaults.map(category => addDoc(categoriesRef, {
        ...category,
        createdAt: new Date().toISOString()
      })));
    }

    function subscribeToFirestore() {
      onSnapshot(query(categoriesRef), snapshot => {
        state.categories = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAll();
      });

      onSnapshot(query(tasksRef), snapshot => {
        state.tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAll();
      });

      onSnapshot(query(completionsRef), snapshot => {
        state.completions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAll();
      });
    }
    function registerServiceWorker() {
      if (!("serviceWorker" in navigator)) return;
      if (window.location.protocol === "file:") return;

      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js")
          .catch(error => console.warn("Kunne ikke registrere service worker:", error));
      });
    }

    async function init() {
      document.querySelectorAll(".tab-button, .bottom-tab, .icon-button").forEach(btn => {
        btn.addEventListener("click", () => switchTab(btn.dataset.tab));
      });

      document.getElementById("taskForm").addEventListener("submit", handleTaskSubmit);
      document.getElementById("categoryForm").addEventListener("submit", handleCategorySubmit);
      document.getElementById("taskFrequency").addEventListener("change", toggleCustomInterval);
      document.getElementById("taskSeasonMode").addEventListener("change", toggleSeasonFields);
      document.getElementById("taskViewMode").addEventListener("change", renderTasks);
      document.getElementById("taskCategoryFilter").addEventListener("change", renderTasks);
      document.querySelectorAll(".color-swatch").forEach(swatch => {
        swatch.addEventListener("click", () => selectCategoryColor(swatch.dataset.color));
      });

      document.getElementById("currentUser").addEventListener("change", event => {
        localStorage.setItem("homeTasksPrototype.currentUser", event.target.value);
      });

      const savedUser = localStorage.getItem("homeTasksPrototype.currentUser");
      if (savedUser) document.getElementById("currentUser").value = savedUser;

      resetTaskForm();
      renderAll();
      checkForAppUpdate();
      await signInAnonymously(auth);
      await seedDefaultCategoriesIfNeeded();
      subscribeToFirestore();
      hasRenderedInitial = true;
    }

    window.switchTab = switchTab;
    window.openTaskForm = openTaskForm;
    window.openTaskDetail = openTaskDetail;
    window.setTaskCompletionFromDetail = setTaskCompletionFromDetail;
    window.toggleComplete = toggleComplete;
    window.editTask = editTask;
    window.deactivateTask = deactivateTask;
    window.resetTaskForm = resetTaskForm;
    window.cancelTaskEdit = cancelTaskEdit;
    window.toggleCustomInterval = toggleCustomInterval;
    window.toggleSeasonFields = toggleSeasonFields;
    window.deleteCategory = deleteCategory;
    window.undoCompletion = undoCompletion;
    window.clearHistory = clearHistory;
    window.changeCalendarMonth = changeCalendarMonth;
    window.goToCurrentMonth = goToCurrentMonth;
    window.refreshApp = refreshApp;
    registerServiceWorker();

    init().catch(error => {
      console.error(error);
      alert("Klarte ikke å koble til Firebase. Sjekk Firestore Rules og Firebase-konfigurasjonen.");
    });


