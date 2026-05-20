// ============================================================
// CLEANTRACK — MAIN APP
// ============================================================

// ── STATE ────────────────────────────────────────────────────
const State = {
  units: [],
  currentUnitId: null,
  currentUnit: null,
  sections: [],        // for current unit
  tasks: {},           // sectionId -> task[]
  taskImages: {},      // taskId -> image[]
  taskStates: {},      // taskId -> state obj
  session: null,
  activeModal: null,   // 'photos'
  activePhotoTaskId: null,
};

// ── ROUTER ───────────────────────────────────────────────────
const Pages = {
  HOME: 'home',
  CHECKLIST: 'checklist',
  DASHBOARD: 'dashboard',
};

let currentPage = Pages.HOME;

function navigate(page, unitId = null) {
  currentPage = page;
  State.currentUnitId = unitId;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (page === Pages.HOME) document.querySelector('[data-nav="home"]').classList.add('active');
  if (page === Pages.DASHBOARD) document.querySelector('[data-nav="dashboard"]').classList.add('active');

  if (page === Pages.HOME) renderHome();
  if (page === Pages.CHECKLIST) renderChecklist(unitId);
  if (page === Pages.DASHBOARD) renderDashboard();
}

// ── TOAST ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── DIALOG ──────────────────────────────────────────────────
let dialogResolve = null;

function showDialog({ title, msg, input, inputValue, confirmText, cancelText, danger } = {}) {
  return new Promise(resolve => {
    dialogResolve = resolve;
    const overlay = document.getElementById('dialog-overlay');
    document.getElementById('dialog-title').textContent = title || '';
    document.getElementById('dialog-msg').textContent = msg || '';

    const inp = document.getElementById('dialog-input');
    if (input) {
      inp.style.display = 'block';
      inp.value = inputValue || '';
      setTimeout(() => inp.focus(), 50);
    } else {
      inp.style.display = 'none';
    }

    const confirmBtn = document.getElementById('dialog-confirm');
    confirmBtn.textContent = confirmText || 'Confirm';
    confirmBtn.className = 'btn btn-sm ' + (danger ? 'btn-danger' : 'btn-white');

    document.getElementById('dialog-cancel').textContent = cancelText || 'Cancel';
    overlay.classList.add('open');
  });
}

function closeDialog(confirmed) {
  const overlay = document.getElementById('dialog-overlay');
  overlay.classList.remove('open');
  const val = document.getElementById('dialog-input').value.trim();
  if (dialogResolve) {
    dialogResolve(confirmed ? (document.getElementById('dialog-input').style.display !== 'none' ? val : true) : null);
    dialogResolve = null;
  }
}

// ── LOGIN ────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-error').textContent = '';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';
  updateRoleUI();
  navigate(Pages.HOME);
}

function updateRoleUI() {
  const role = Auth.getRole();
  const badge = document.getElementById('role-badge');
  badge.textContent = role === 'owner' ? Translations.t('ownerMode') : Translations.t('cleanerMode');
  badge.className = 'topbar-role ' + role;

  // Show/hide dashboard nav for owner only
  document.querySelector('[data-nav="dashboard"]').style.display =
    Auth.isOwner() ? 'flex' : 'none';
}

// ── HOME PAGE ────────────────────────────────────────────────
async function renderHome() {
  const container = document.getElementById('home-units');
  const addBtn = document.getElementById('home-add-unit');
  container.innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';
  addBtn.style.display = Auth.isOwner() ? 'inline-flex' : 'none';

  try {
    State.units = await getUnits();

    if (State.units.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12h6M12 9v6"/></svg>
          <p>${Translations.t('noUnits')}</p>
        </div>`;
      return;
    }

    // Load progress for each unit
    const cards = await Promise.all(State.units.map(unit => buildUnitCard(unit)));
    container.innerHTML = '';
    cards.forEach(card => container.appendChild(card));

  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>${Translations.t('error')}</p></div>`;
    console.error(e);
  }
}

async function buildUnitCard(unit) {
  const card = document.createElement('div');
  card.className = 'unit-card';
  card.dataset.unitId = unit.id;

  // Get session and task states for progress
  let pct = 0, checked = 0, total = 0, flagCount = 0;
  try {
    const session = await getOrCreateSession(unit.id);
    const allTasks = await getAllTasksForUnit(unit.id);
    total = allTasks.length;

    if (total > 0) {
      const states = await getTaskStates(unit.id, session.id);
      checked = states.filter(s => s.checked).length;
      flagCount = states.filter(s => s.flagged).length;
      pct = Math.round((checked / total) * 100);
    }
  } catch (e) { /* unit might have no tasks */ }

  card.innerHTML = `
    <div class="unit-card-header">
      <div class="unit-card-name">${escHtml(unit.name)}</div>
      <div class="unit-card-actions" onclick="event.stopPropagation()">
        ${Auth.isOwner() ? `
          <button class="btn-icon" title="Rename" onclick="renameUnit('${unit.id}','${escAttr(unit.name)}')">
            ${icons.edit}
          </button>
          <button class="btn-icon danger" title="Delete" onclick="deleteUnitAction('${unit.id}')">
            ${icons.trash}
          </button>
        ` : ''}
      </div>
    </div>
    <div class="progress-wrap">
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="progress-labels">
        <span class="progress-pct">${pct}% ${Translations.t('complete')}</span>
        <span class="progress-count">${checked}/${total}</span>
      </div>
    </div>
    ${flagCount > 0 ? `<div class="flag-badge">${icons.flagFill} ${flagCount} ${Translations.t('flagged')}</div>` : ''}
  `;

  card.addEventListener('click', () => navigate(Pages.CHECKLIST, unit.id));
  return card;
}

async function renameUnit(id, currentName) {
  const name = await showDialog({
    title: Translations.t('rename'),
    input: true,
    inputValue: currentName,
    confirmText: Translations.t('save'),
  });
  if (!name) return;
  await updateUnit(id, { name });
  renderHome();
}

async function deleteUnitAction(id) {
  const ok = await showDialog({
    title: Translations.t('delete'),
    msg: Translations.t('confirmDelete'),
    confirmText: Translations.t('delete'),
    danger: true,
  });
  if (!ok) return;
  await deleteUnit(id);
  renderHome();
}

async function addUnit() {
  const name = await showDialog({
    title: Translations.t('addUnit'),
    input: true,
    confirmText: Translations.t('save'),
  });
  if (!name) return;
  await createUnit(name);
  renderHome();
}

// ── CHECKLIST PAGE ───────────────────────────────────────────
async function renderChecklist(unitId) {
  const page = document.getElementById('page-checklist');
  page.innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';

  try {
    // Load unit info
    State.units = await getUnits();
    State.currentUnit = State.units.find(u => u.id === unitId);
    if (!State.currentUnit) { navigate(Pages.HOME); return; }

    // Load session
    State.session = await getOrCreateSession(unitId);

    // Load sections + tasks
    State.sections = await getSections(unitId);
    State.tasks = {};
    State.taskStates = {};
    State.taskImages = {};

    for (const sec of State.sections) {
      State.tasks[sec.id] = await getTasks(sec.id);
    }

    // Load task states for this session
    const states = await getTaskStates(unitId, State.session.id);
    states.forEach(s => { State.taskStates[s.task_id] = s; });

    page.innerHTML = buildChecklistHTML();
    attachChecklistEvents();

  } catch (e) {
    page.innerHTML = `<div class="empty-state"><p>${Translations.t('error')}</p></div>`;
    console.error(e);
  }
}

function buildChecklistHTML() {
  const unit = State.currentUnit;
  const allTasks = Object.values(State.tasks).flat();
  const total = allTasks.length;
  const checked = allTasks.filter(t => State.taskStates[t.id]?.checked).length;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  const sectionsHTML = State.sections.map((sec, idx) => buildSectionHTML(sec, idx)).join('');

  return `
    <div class="checklist-header">
      <button class="checklist-back" onclick="navigate('${Pages.HOME}')">
        ${icons.back} ${Translations.t('home')}
      </button>
      <div class="checklist-title-row">
        <h2 class="checklist-title">${escHtml(unit.name)}</h2>
        <div class="checklist-actions">
          ${Auth.isOwner() ? `
            <button class="btn btn-ghost btn-sm" onclick="addSectionAction()">
              ${icons.plus} ${Translations.t('addSection')}
            </button>
            <button class="btn btn-ghost btn-sm" onclick="resetSessionAction()">
              ${icons.refresh} ${Translations.t('reset')}
            </button>
          ` : ''}
        </div>
      </div>
      <div class="checklist-progress">
        <div class="progress-bar-bg"><div class="progress-bar-fill" id="cl-progress-bar" style="width:${pct}%"></div></div>
        <div class="progress-labels">
          <span class="progress-pct" id="cl-progress-pct">${pct}% ${Translations.t('complete')}</span>
          <span class="progress-count" id="cl-progress-count">${checked}/${total}</span>
        </div>
      </div>
    </div>
    <div class="sections-list" id="sections-list">
      ${sectionsHTML || `<div class="empty-state"><p>${Auth.isOwner() ? Translations.t('addSection') : ''}</p></div>`}
    </div>
  `;
}

function buildSectionHTML(sec, idx) {
  const tasks = State.tasks[sec.id] || [];
  const checkedCount = tasks.filter(t => State.taskStates[t.id]?.checked).length;
  const isOpen = true; // default open

  return `
    <div class="section-block open" id="section-${sec.id}" data-section-id="${sec.id}">
      <div class="section-header" onclick="toggleSection('${sec.id}')">
        <span class="section-toggle">${icons.chevronRight}</span>
        <span class="section-name">${escHtml(sec.name)}</span>
        <span class="section-progress-mini">${checkedCount}/${tasks.length}</span>
        <div class="section-owner-actions" onclick="event.stopPropagation()">
          ${Auth.isOwner() ? `
            <button class="btn-icon" title="Move Up" onclick="moveSectionUp('${sec.id}')">${icons.arrowUp}</button>
            <button class="btn-icon" title="Move Down" onclick="moveSectionDown('${sec.id}')">${icons.arrowDown}</button>
            <button class="btn-icon" title="Rename" onclick="renameSectionAction('${sec.id}','${escAttr(sec.name)}')">${icons.edit}</button>
            <button class="btn-icon danger" title="Delete" onclick="deleteSectionAction('${sec.id}')">${icons.trash}</button>
          ` : ''}
        </div>
      </div>
      <div class="section-body">
        ${tasks.map(t => buildTaskHTML(t)).join('')}
        ${Auth.isOwner() ? `
          <div class="add-task-row">
            <input class="add-task-input" type="text" placeholder="${Translations.t('addTask')}..." data-section="${sec.id}" onkeydown="handleAddTaskKey(event)">
            <button class="btn-icon" onclick="addTaskFromInput('${sec.id}')">${icons.plus}</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function buildTaskHTML(task) {
  const state = State.taskStates[task.id] || {};
  const images = State.taskImages[task.id] || [];
  const hasPhotos = images.length > 0;

  return `
    <div class="task-item ${state.checked ? 'checked' : ''} ${state.flagged ? 'flagged-item-highlight' : ''}" id="task-${task.id}" data-task-id="${task.id}">
      <div class="task-checkbox" onclick="toggleTaskCheck('${task.id}')">
        ${icons.check}
      </div>
      <div class="task-content">
        <span class="task-name">${escHtml(task.name)}</span>
        ${state.note ? `<span class="task-note">"${escHtml(state.note)}"</span>` : ''}
        <div class="task-meta-row">
          ${state.flagged ? `<span class="flag-badge">${icons.flagFill} ${Translations.t('flagged')}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn-icon ${state.flagged ? 'flag-active' : ''}" title="${Translations.t('flag')}" onclick="toggleFlag('${task.id}')">
          ${state.flagged ? icons.flagFill2 : icons.flag}
        </button>
        <button class="btn-icon" title="${Translations.t('note')}" onclick="toggleNoteInput('${task.id}')">
          ${icons.note}
        </button>
        <button class="btn-icon" title="${Translations.t('photos')}" onclick="openPhotos('${task.id}','${escAttr(task.name)}')">
          ${icons.photo}
        </button>
        ${Auth.isOwner() ? `
          <button class="btn-icon danger" title="Delete" onclick="deleteTaskAction('${task.id}','${escAttr(task.name)}')">${icons.trash}</button>
        ` : ''}
      </div>
    </div>
    <div class="note-input-wrap" id="note-wrap-${task.id}" style="display:none">
      <textarea class="note-textarea" id="note-ta-${task.id}" placeholder="${Translations.t('addNote')}">${escHtml(state.note || '')}</textarea>
      <div class="note-actions">
        <button class="btn btn-ghost btn-sm" onclick="cancelNote('${task.id}')">${Translations.t('cancel')}</button>
        <button class="btn btn-white btn-sm" onclick="saveNote('${task.id}')">${Translations.t('save')}</button>
      </div>
    </div>
  `;
}

function attachChecklistEvents() {
  // nothing extra needed; all handled by inline onclick
}

function toggleSection(sectionId) {
  const block = document.getElementById(`section-${sectionId}`);
  block.classList.toggle('open');
}

async function toggleTaskCheck(taskId) {
  const state = State.taskStates[taskId] || {};
  const newChecked = !state.checked;
  State.taskStates[taskId] = { ...state, checked: newChecked };

  const el = document.getElementById(`task-${taskId}`);
  el.classList.toggle('checked', newChecked);

  updateChecklistProgress();

  try {
    await upsertTaskState(taskId, State.currentUnitId, State.session.id, { checked: newChecked });
  } catch (e) { console.error(e); }
}

async function toggleFlag(taskId) {
  const state = State.taskStates[taskId] || {};
  const newFlagged = !state.flagged;
  State.taskStates[taskId] = { ...state, flagged: newFlagged };

  // Re-render just this task
  const task = Object.values(State.tasks).flat().find(t => t.id === taskId);
  if (!task) return;
  const el = document.getElementById(`task-${taskId}`);
  const wrap = document.getElementById(`note-wrap-${taskId}`);
  const noteVisible = wrap && wrap.style.display !== 'none';

  el.outerHTML = buildTaskHTML(task);

  // Restore note wrap if it was visible
  if (noteVisible) {
    document.getElementById(`note-wrap-${taskId}`).style.display = 'flex';
  }

  try {
    await upsertTaskState(taskId, State.currentUnitId, State.session.id, { flagged: newFlagged });
  } catch (e) { console.error(e); }
}

function toggleNoteInput(taskId) {
  const wrap = document.getElementById(`note-wrap-${taskId}`);
  const isOpen = wrap.style.display !== 'none';
  wrap.style.display = isOpen ? 'none' : 'flex';
  wrap.style.flexDirection = 'column';
  if (!isOpen) document.getElementById(`note-ta-${taskId}`).focus();
}

function cancelNote(taskId) {
  document.getElementById(`note-wrap-${taskId}`).style.display = 'none';
}

async function saveNote(taskId) {
  const ta = document.getElementById(`note-ta-${taskId}`);
  const note = ta.value.trim();
  const state = State.taskStates[taskId] || {};
  State.taskStates[taskId] = { ...state, note };

  document.getElementById(`note-wrap-${taskId}`).style.display = 'none';

  const task = Object.values(State.tasks).flat().find(t => t.id === taskId);
  if (task) {
    const el = document.getElementById(`task-${taskId}`);
    el.outerHTML = buildTaskHTML(task);
  }

  try {
    await upsertTaskState(taskId, State.currentUnitId, State.session.id, { note });
    showToast(Translations.t('save'));
  } catch (e) { console.error(e); }
}

function updateChecklistProgress() {
  const allTasks = Object.values(State.tasks).flat();
  const total = allTasks.length;
  const checked = allTasks.filter(t => State.taskStates[t.id]?.checked).length;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  const bar = document.getElementById('cl-progress-bar');
  const pctEl = document.getElementById('cl-progress-pct');
  const countEl = document.getElementById('cl-progress-count');
  if (bar) bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = `${pct}% ${Translations.t('complete')}`;
  if (countEl) countEl.textContent = `${checked}/${total}`;

  // Update section mini progress
  State.sections.forEach(sec => {
    const tasks = State.tasks[sec.id] || [];
    const secChecked = tasks.filter(t => State.taskStates[t.id]?.checked).length;
    const miniEl = document.querySelector(`#section-${sec.id} .section-progress-mini`);
    if (miniEl) miniEl.textContent = `${secChecked}/${tasks.length}`;
  });
}

// ── OWNER: ADD / RENAME / DELETE SECTIONS ───────────────────
async function addSectionAction() {
  const name = await showDialog({
    title: Translations.t('addSection'),
    input: true,
    confirmText: Translations.t('save'),
  });
  if (!name) return;
  await createSection(State.currentUnitId, name);
  await renderChecklist(State.currentUnitId);
}

async function renameSectionAction(id, currentName) {
  const name = await showDialog({
    title: Translations.t('rename'),
    input: true,
    inputValue: currentName,
    confirmText: Translations.t('save'),
  });
  if (!name) return;
  await updateSection(id, { name });
  await renderChecklist(State.currentUnitId);
}

async function deleteSectionAction(id) {
  const ok = await showDialog({
    title: Translations.t('delete'),
    msg: Translations.t('confirmDelete'),
    confirmText: Translations.t('delete'),
    danger: true,
  });
  if (!ok) return;
  await deleteSection(id);
  State.sections = State.sections.filter(s => s.id !== id);
  delete State.tasks[id];
  await renderChecklist(State.currentUnitId);
}

async function moveSectionUp(id) {
  const idx = State.sections.findIndex(s => s.id === id);
  if (idx <= 0) return;
  [State.sections[idx - 1], State.sections[idx]] = [State.sections[idx], State.sections[idx - 1]];
  await reorderSections(State.currentUnitId, State.sections.map(s => s.id));
  await renderChecklist(State.currentUnitId);
}

async function moveSectionDown(id) {
  const idx = State.sections.findIndex(s => s.id === id);
  if (idx >= State.sections.length - 1) return;
  [State.sections[idx], State.sections[idx + 1]] = [State.sections[idx + 1], State.sections[idx]];
  await reorderSections(State.currentUnitId, State.sections.map(s => s.id));
  await renderChecklist(State.currentUnitId);
}

// ── OWNER: ADD / DELETE TASKS ────────────────────────────────
async function addTaskFromInput(sectionId) {
  const input = document.querySelector(`.add-task-input[data-section="${sectionId}"]`);
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  input.value = '';

  const task = await createTask(sectionId, name);
  if (!State.tasks[sectionId]) State.tasks[sectionId] = [];
  State.tasks[sectionId].push(task);

  // Re-render section body only
  const body = document.querySelector(`#section-${sectionId} .section-body`);
  if (body) {
    const tasks = State.tasks[sectionId];
    body.innerHTML = tasks.map(t => buildTaskHTML(t)).join('') + `
      <div class="add-task-row">
        <input class="add-task-input" type="text" placeholder="${Translations.t('addTask')}..." data-section="${sectionId}" onkeydown="handleAddTaskKey(event)">
        <button class="btn-icon" onclick="addTaskFromInput('${sectionId}')">${icons.plus}</button>
      </div>`;
  }
  updateChecklistProgress();
}

function handleAddTaskKey(event) {
  if (event.key === 'Enter') {
    const sectionId = event.target.dataset.section;
    addTaskFromInput(sectionId);
  }
}

async function deleteTaskAction(taskId, taskName) {
  const ok = await showDialog({
    title: Translations.t('delete'),
    msg: Translations.t('confirmDelete'),
    confirmText: Translations.t('delete'),
    danger: true,
  });
  if (!ok) return;
  await deleteTask(taskId);

  // Remove from state
  for (const sectionId in State.tasks) {
    State.tasks[sectionId] = State.tasks[sectionId].filter(t => t.id !== taskId);
  }

  const el = document.getElementById(`task-${taskId}`);
  const wrap = document.getElementById(`note-wrap-${taskId}`);
  if (el) el.remove();
  if (wrap) wrap.remove();
  updateChecklistProgress();
}

// ── RESET SESSION ────────────────────────────────────────────
async function resetSessionAction() {
  const ok = await showDialog({
    title: Translations.t('reset'),
    msg: Translations.t('resetConfirm'),
    confirmText: Translations.t('reset'),
    danger: true,
  });
  if (!ok) return;

  await resetTaskStates(State.currentUnitId, State.session.id);
  // Create new session
  State.session = await createSession(State.currentUnitId);
  State.taskStates = {};
  await renderChecklist(State.currentUnitId);
  showToast(Translations.t('reset'));
}

// ── PHOTOS MODAL ─────────────────────────────────────────────
async function openPhotos(taskId, taskName) {
  State.activePhotoTaskId = taskId;
  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = taskName;
  document.getElementById('modal-photos').innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';
  modal.classList.add('open');

  try {
    const images = await getTaskImages(taskId);
    State.taskImages[taskId] = images;
    renderPhotoGrid(taskId, images);
  } catch (e) {
    document.getElementById('modal-photos').innerHTML = `<p style="padding:16px;color:var(--gray-500)">${Translations.t('error')}</p>`;
  }
}

function renderPhotoGrid(taskId, images) {
  const container = document.getElementById('modal-photos');
  const canUpload = Auth.isOwner();

  const photosHTML = images.length > 0
    ? `<div class="photo-grid">${images.map(img => `
        <div class="photo-item" data-img-id="${img.id}">
          <img src="${img.url}" alt="" loading="lazy" onclick="openLightbox('${img.url}')">
          ${canUpload ? `<button class="photo-delete-btn" onclick="deletePhotoAction('${img.id}','${img.path}','${taskId}')">${icons.x}</button>` : ''}
        </div>`).join('')}</div>`
    : '';

  const uploadHTML = canUpload ? `
    <div class="photo-upload-area" onclick="document.getElementById('file-input').click()">
      ${icons.upload}
      <p>${Translations.t('uploadPhoto')}</p>
    </div>
    <input type="file" id="file-input" accept="image/*" multiple style="display:none" onchange="handleFileUpload(event,'${taskId}')">
  ` : '';

  container.innerHTML = photosHTML + uploadHTML;

  if (!images.length && !canUpload) {
    container.innerHTML = `<div class="empty-state"><p>${Translations.t('photos')}: —</p></div>`;
  }
}

async function handleFileUpload(event, taskId) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  const container = document.getElementById('modal-photos');
  container.innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';

  try {
    for (const file of files) {
      await uploadImage(taskId, file);
    }
    const images = await getTaskImages(taskId);
    State.taskImages[taskId] = images;
    renderPhotoGrid(taskId, images);
    showToast('Photo uploaded');
  } catch (e) {
    showToast(Translations.t('error'));
    console.error(e);
  }
}

async function deletePhotoAction(imgId, path, taskId) {
  const ok = await showDialog({
    title: Translations.t('delete'),
    msg: Translations.t('confirmDelete'),
    confirmText: Translations.t('delete'),
    danger: true,
  });
  if (!ok) return;
  await deleteImage(imgId, path);
  const images = await getTaskImages(taskId);
  State.taskImages[taskId] = images;
  renderPhotoGrid(taskId, images);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function openLightbox(url) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = url;
  lb.classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

// ── DASHBOARD PAGE ───────────────────────────────────────────
async function renderDashboard() {
  if (!Auth.isOwner()) { navigate(Pages.HOME); return; }
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';

  try {
    const units = await getUnits();
    if (!units.length) {
      container.innerHTML = `<div class="empty-state"><p>${Translations.t('noUnits')}</p></div>`;
      return;
    }

    const cards = await Promise.all(units.map(async unit => {
      const session = await getOrCreateSession(unit.id);
      const allTasks = await getAllTasksForUnit(unit.id);
      const total = allTasks.length;
      const states = await getTaskStates(unit.id, session.id);
      const checked = states.filter(s => s.checked).length;
      const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
      const flagged = states.filter(s => s.flagged);

      // Get task details for flagged items
      const flagDetails = await Promise.all(flagged.map(async f => {
        const task = allTasks.find(t => t.id === f.task_id);
        return { ...f, taskName: task?.name || '?' };
      }));

      return { unit, pct, checked, total, flagDetails };
    }));

    container.innerHTML = cards.map(({ unit, pct, checked, total, flagDetails }) => `
      <div class="dash-unit-card">
        <div class="dash-unit-header" onclick="navigate('${Pages.CHECKLIST}','${unit.id}')">
          <span class="dash-unit-name">${escHtml(unit.name)}</span>
          <div style="display:flex;align-items:center;gap:12px">
            <span class="progress-pct">${pct}%</span>
            <div class="progress-bar-bg" style="width:80px">
              <div class="progress-bar-fill" style="width:${pct}%"></div>
            </div>
          </div>
        </div>
        <div class="flagged-list">
          ${flagDetails.length === 0
            ? `<div class="no-flags-msg">${Translations.t('noFlags')}</div>`
            : flagDetails.map(f => `
              <div class="flagged-item">
                <div class="flagged-item-header">
                  ${icons.flagFill}
                  <span class="flagged-task-name">${escHtml(f.taskName)}</span>
                </div>
                ${f.note ? `<div class="flagged-note">"${escHtml(f.note)}"</div>` : ''}
              </div>`).join('')
          }
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>${Translations.t('error')}</p></div>`;
    console.error(e);
  }
}

// ── LANGUAGE TOGGLE ──────────────────────────────────────────
async function toggleLanguage() {
  const newVal = !Translations.getIsSpanish();
  const btn = document.getElementById('lang-toggle');
  btn.textContent = newVal ? '...' : Translations.t('spanish');

  await Translations.setLanguage(newVal);

  btn.textContent = newVal ? Translations.t('english') : Translations.t('spanish');
  btn.className = 'topbar-btn lang-toggle' + (newVal ? ' es' : '');

  // Re-render current page
  navigate(currentPage, State.currentUnitId);
  updateRoleUI();
}

// ── UTILS ────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(str) {
  return String(str || '').replace(/'/g, "\\'");
}

// ── ICONS ────────────────────────────────────────────────────
const icons = {
  check: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
  plus: `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  edit: `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  back: `<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>`,
  arrowDown: `<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`,
  flag: `<svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
  flagFill: `<svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="currentColor"/><line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"/></svg>`,
  flagFill2: `<svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="currentColor"/><line x1="4" y1="22" x2="4" y2="15" stroke-width="1.8"/></svg>`,
  note: `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  photo: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  upload: `<svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
  x: `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  home: `<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  dashboard: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
};

// ── INIT ─────────────────────────────────────────────────────
async function init() {
  Auth.init();
  Translations.init();

  // Build static HTML shell
  document.getElementById('app').innerHTML = buildAppShell();

  // Wire up login
  document.getElementById('pin-submit').addEventListener('click', handleLogin);
  document.getElementById('pin-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });

  // Wire up dialog
  document.getElementById('dialog-confirm').addEventListener('click', () => closeDialog(true));
  document.getElementById('dialog-cancel').addEventListener('click', () => closeDialog(false));
  document.getElementById('dialog-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('dialog-overlay')) closeDialog(false);
  });

  // Wire up modal close
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);

  // Wire up lightbox close
  document.getElementById('lightbox').addEventListener('click', e => {
    if (e.target === document.getElementById('lightbox') || e.target === document.getElementById('lightbox-close')) closeLightbox();
  });

  // Nav
  document.querySelector('[data-nav="home"]').addEventListener('click', () => navigate(Pages.HOME));
  document.querySelector('[data-nav="dashboard"]').addEventListener('click', () => navigate(Pages.DASHBOARD));

  // Lang toggle
  document.getElementById('lang-toggle').addEventListener('click', toggleLanguage);

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    Auth.logout();
    showLogin();
  });

  // Add unit button
  document.getElementById('home-add-unit').addEventListener('click', addUnit);

  // Check auth
  if (Auth.isLoggedIn()) {
    showApp();
  } else {
    showLogin();
  }
}

function handleLogin() {
  const pin = document.getElementById('pin-input').value.trim();
  const role = Auth.tryLogin(pin);
  if (role) {
    showApp();
  } else {
    document.getElementById('pin-error').textContent = Translations.t('incorrectPin');
    document.getElementById('pin-input').value = '';
    document.getElementById('pin-input').focus();
  }
}

function buildAppShell() {
  return `
    <!-- LOGIN -->
    <div id="login-screen" style="display:flex">
      <div class="login-logo">
        <h1>CleanTrack</h1>
        <p>Short-Term Rental Manager</p>
      </div>
      <div class="pin-form">
        <div class="pin-input-wrap">
          <input class="pin-input" id="pin-input" type="password" inputmode="numeric" maxlength="10" placeholder="Enter PIN">
        </div>
        <div class="pin-error" id="pin-error"></div>
        <button class="btn-primary" id="pin-submit">Log In</button>
      </div>
    </div>

    <!-- MAIN APP -->
    <div id="main-app" style="display:none; flex-direction:column; flex:1">
      <!-- TOP BAR -->
      <header id="topbar">
        <span class="topbar-logo">CleanTrack</span>
        <span class="topbar-role" id="role-badge"></span>
        <button class="topbar-btn" id="lang-toggle">Español</button>
        <button class="topbar-btn" id="logout-btn">↩</button>
      </header>

      <!-- PAGES -->
      <main style="flex:1">
        <!-- HOME -->
        <div class="page active" id="page-home">
          <div class="page-header">
            <div>
              <div class="page-header-sub">Overview</div>
              <h2 id="home-title">Units</h2>
            </div>
            <button class="btn btn-white" id="home-add-unit" style="display:none">
              ${icons.plus} Add Unit
            </button>
          </div>
          <div class="units-list" id="home-units">
            <div class="page-loading"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- CHECKLIST -->
        <div class="page" id="page-checklist"></div>

        <!-- DASHBOARD -->
        <div class="page" id="page-dashboard">
          <div class="page-header">
            <div>
              <div class="page-header-sub">Owner</div>
              <h2>Dashboard</h2>
            </div>
          </div>
          <div class="dashboard-grid" id="dashboard-content"></div>
        </div>
      </main>

      <!-- BOTTOM NAV -->
      <nav id="bottom-nav">
        <button class="nav-item active" data-nav="home">
          ${icons.home}
          <span>Units</span>
        </button>
        <button class="nav-item" data-nav="dashboard">
          ${icons.dashboard}
          <span>Dashboard</span>
        </button>
      </nav>
    </div>

    <!-- PHOTOS MODAL -->
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <span class="modal-title" id="modal-title">Photos</span>
          <button class="btn-icon" id="modal-close">${icons.x}</button>
        </div>
        <div id="modal-photos"></div>
      </div>
    </div>

    <!-- LIGHTBOX -->
    <div class="lightbox" id="lightbox">
      <img id="lightbox-img" src="" alt="">
      <button class="lightbox-close" id="lightbox-close">${icons.x}</button>
    </div>

    <!-- DIALOG -->
    <div class="dialog-overlay" id="dialog-overlay">
      <div class="dialog-box">
        <div class="dialog-title" id="dialog-title"></div>
        <div class="dialog-msg" id="dialog-msg"></div>
        <input class="dialog-input" id="dialog-input" type="text" style="display:none">
        <div class="dialog-actions">
          <button class="btn btn-ghost btn-sm" id="dialog-cancel">Cancel</button>
          <button class="btn btn-white btn-sm" id="dialog-confirm">Confirm</button>
        </div>
      </div>
    </div>

    <!-- TOAST -->
    <div class="toast" id="toast"></div>
  `;
}

// Start
window.addEventListener('DOMContentLoaded', init);
