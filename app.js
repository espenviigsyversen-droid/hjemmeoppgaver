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
      getDocs,
      query,
      serverTimestamp
    } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

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

    function shouldAppearThisWeek(task) {
      if (!task.isActive) return false;

      const currentWeekStart = getWeekStartISO();
      if (toDate(task.startDate) > endOfISOWeek()) return false;

      const latestCompletion = getLatestCompletion(task.id);

      if (!latestCompletion) {
        return isFrequencyDue(task, task.startDate, currentWeekStart) || toDate(task.startDate) <= endOfISOWeek();
      }

      const completedWeek = latestCompletion.weekStartDate;
      if (completedWeek === currentWeekStart) return true;

      return isFrequencyDue(task, latestCompletion.completedAt.slice(0, 10), currentWeekStart);
    }

    function isFrequencyDue(task, referenceDateISO, currentWeekStartISO) {
      if (task.frequencyType === "weekly") return weeksBetween(referenceDateISO, currentWeekStartISO) >= 1;
      if (task.frequencyType === "biweekly") return weeksBetween(referenceDateISO, currentWeekStartISO) >= 2;
      if (task.frequencyType === "customWeeks") return weeksBetween(referenceDateISO, currentWeekStartISO) >= Number(task.customIntervalWeeks || 1);
      if (task.frequencyType === "monthly") return monthsBetween(referenceDateISO, currentWeekStartISO) >= 1;
      if (task.frequencyType === "semiannual") return monthsBetween(referenceDateISO, currentWeekStartISO) >= 6;
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

    function getCategory(id) {
      return state.categories.find(c => c.id === id) || { name: "Ukjent", color: "#e8e2dc" };
    }

    function switchTab(tabId) {
      document.querySelectorAll(".tab-button, .bottom-tab").forEach(btn => {
        const isSetupChild = tabId === "categories" && btn.dataset.tab === "setup";
        btn.classList.toggle("active", btn.dataset.tab === tabId || isSetupChild);
      });
      document.querySelectorAll(".panel").forEach(panel => {
        panel.classList.toggle("active", panel.id === tabId);
      });
    }

    function renderAll() {
      renderWeekTitle();
      renderDashboard();
      renderTasks();
      renderCategories();
      renderCategoryOptions();
      renderCalendar();
      renderHistory();
    }

    function renderWeekTitle() {
      const start = getWeekStartISO();
      const end = getWeekEndISO();
      document.getElementById("weekTitle").textContent = `Uke ${getISOWeek(new Date())}: ${formatDate(start)} – ${formatDate(end)}`;
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
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(task => renderTaskCard(task, { dashboard: true }))
        .join("");
    }

    function renderTasks() {
      const container = document.getElementById("allTasks");
      const activeTasks = state.tasks.filter(t => t.isActive);

      if (activeTasks.length === 0) {
        container.innerHTML = `<div class="empty-state">Ingen aktive oppgaver ennå.</div>`;
        return;
      }

      container.innerHTML = activeTasks
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(task => renderTaskCard(task, { dashboard: false }))
        .join("");
    }

    function renderTaskCard(task, options = {}) {
      const category = getCategory(task.categoryId);
      const completed = isCompletedThisWeek(task.id);
      const completion = getCompletionThisWeek(task.id);
      const doneText = completion ? `Utført av ${completion.completedBy}` : "Ikke utført";

      return `
        <article class="task-card ${completed ? "done" : ""}">
          ${options.dashboard ? `<input class="checkbox" type="checkbox" ${completed ? "checked" : ""} onchange="toggleComplete('${task.id}', this.checked)" />` : `<span class="dot" style="background:${category.color}"></span>`}
          <div>
            <h3 class="task-title">${escapeHtml(task.title)}</h3>
            <p class="task-description">${escapeHtml(task.description || "Ingen beskrivelse")}</p>
            <div class="meta-row">
              <span class="pill" style="background:${category.color}33">${escapeHtml(category.name)}</span>
              <span class="pill purple">${frequencyLabel(task)}</span>
              <span class="pill pink">${assignedLabel(task)}</span>
              ${options.dashboard ? `<span class="pill ${completed ? "pink" : "red"}">${doneText}</span>` : ""}
            </div>
          </div>
          <div class="actions">
            ${!options.dashboard ? `<button class="btn-light" onclick="editTask('${task.id}')">Rediger</button>` : ""}
            ${!options.dashboard ? `<button class="btn-danger" onclick="deactivateTask('${task.id}')">Deaktiver</button>` : ""}
          </div>
        </article>`;
    }

    async function toggleComplete(taskId, checked) {
      const currentUser = document.getElementById("currentUser").value;
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;

      const category = getCategory(task.categoryId);
      const weekStart = getWeekStartISO();

      if (checked) {
        if (!isCompletedThisWeek(taskId)) {
          await addDoc(completionsRef, {
            taskId,
            taskTitleSnapshot: task.title,
            categoryNameSnapshot: category.name,
            completedBy: currentUser,
            completedAt: new Date().toISOString(),
            weekStartDate: weekStart,
            scheduledWeekStartDate: weekStart,
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
      const assignedValue = document.getElementById("taskAssignedTo").value;
      const assignedTo = assignedValue === "both" ? ["Espen", "Line"] : [assignedValue];

      const taskData = {
        title: document.getElementById("taskTitle").value.trim(),
        description: document.getElementById("taskDescription").value.trim(),
        categoryId: document.getElementById("taskCategory").value,
        frequencyType: document.getElementById("taskFrequency").value,
        customIntervalWeeks: document.getElementById("taskFrequency").value === "customWeeks" ? Number(document.getElementById("customIntervalWeeks").value || 1) : null,
        startDate: document.getElementById("taskStartDate").value,
        assignedTo,
        isActive: true,
        updatedAt: new Date().toISOString()
      };

      if (editingId) {
        await updateDoc(doc(db, "households", HOUSEHOLD_ID, "tasks", editingId), taskData);
      } else {
        await addDoc(tasksRef, {
          ...taskData,
          createdAt: new Date().toISOString()
        });
      }

      resetTaskForm();
      switchTab("dashboard");
    }

    function editTask(taskId) {
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;

      document.getElementById("editingTaskId").value = task.id;
      document.getElementById("taskTitle").value = task.title;
      document.getElementById("taskDescription").value = task.description || "";
      document.getElementById("taskCategory").value = task.categoryId;
      document.getElementById("taskStartDate").value = task.startDate;
      document.getElementById("taskFrequency").value = task.frequencyType;
      document.getElementById("customIntervalWeeks").value = task.customIntervalWeeks || 3;
      document.getElementById("taskAssignedTo").value = task.assignedTo?.length === 1 ? task.assignedTo[0] : "both";
      document.getElementById("taskFormTitle").textContent = "Rediger oppgave";
      toggleCustomInterval();
      switchTab("tasks");
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
      document.getElementById("taskStartDate").value = todayISO();
      document.getElementById("taskFormTitle").textContent = "Legg til oppgave";
      toggleCustomInterval();
    }

    function toggleCustomInterval() {
      const frequency = document.getElementById("taskFrequency").value;
      document.getElementById("customIntervalWrap").style.display = frequency === "customWeeks" ? "block" : "none";
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
      select.innerHTML = state.categories
        .filter(c => c.isActive)
        .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join("");

      if (currentValue && state.categories.some(c => c.id === currentValue)) {
        select.value = currentValue;
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
      document.querySelectorAll(".tab-button, .bottom-tab").forEach(btn => {
        btn.addEventListener("click", () => switchTab(btn.dataset.tab));
      });

      document.getElementById("taskForm").addEventListener("submit", handleTaskSubmit);
      document.getElementById("categoryForm").addEventListener("submit", handleCategorySubmit);
      document.getElementById("taskFrequency").addEventListener("change", toggleCustomInterval);
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
      await signInAnonymously(auth);
      await seedDefaultCategoriesIfNeeded();
      subscribeToFirestore();
      hasRenderedInitial = true;
    }

    window.switchTab = switchTab;
    window.toggleComplete = toggleComplete;
    window.editTask = editTask;
    window.deactivateTask = deactivateTask;
    window.resetTaskForm = resetTaskForm;
    window.toggleCustomInterval = toggleCustomInterval;
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


