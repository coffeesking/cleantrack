// ============================================================
// DATABASE LAYER
// All Supabase read/write operations
// ============================================================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── UNITS ────────────────────────────────────────────────────

async function getUnits() {
  const { data, error } = await db
    .from('units')
    .select('*')
    .order('position', { ascending: true });
  if (error) throw error;
  return data;
}

async function createUnit(name) {
  const { data: existing } = await db.from('units').select('position').order('position', { ascending: false }).limit(1);
  const nextPos = existing?.length ? existing[0].position + 1 : 0;
  const { data, error } = await db
    .from('units')
    .insert({ name, position: nextPos })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateUnit(id, fields) {
  const { error } = await db.from('units').update(fields).eq('id', id);
  if (error) throw error;
}

async function deleteUnit(id) {
  const { error } = await db.from('units').delete().eq('id', id);
  if (error) throw error;
}

// ── SECTIONS ─────────────────────────────────────────────────

async function getSections(unitId) {
  const { data, error } = await db
    .from('sections')
    .select('*')
    .eq('unit_id', unitId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data;
}

async function createSection(unitId, name) {
  const { data: existing } = await db.from('sections').select('position').eq('unit_id', unitId).order('position', { ascending: false }).limit(1);
  const nextPos = existing?.length ? existing[0].position + 1 : 0;
  const { data, error } = await db
    .from('sections')
    .insert({ unit_id: unitId, name, position: nextPos })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateSection(id, fields) {
  const { error } = await db.from('sections').update(fields).eq('id', id);
  if (error) throw error;
}

async function deleteSection(id) {
  const { error } = await db.from('sections').delete().eq('id', id);
  if (error) throw error;
}

async function reorderSections(unitId, orderedIds) {
  const updates = orderedIds.map((id, index) =>
    db.from('sections').update({ position: index }).eq('id', id)
  );
  await Promise.all(updates);
}

// ── TASKS ────────────────────────────────────────────────────

async function getTasks(sectionId) {
  const { data, error } = await db
    .from('tasks')
    .select('*')
    .eq('section_id', sectionId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data;
}

async function getAllTasksForUnit(unitId) {
  const { data, error } = await db
    .from('tasks')
    .select('*, sections!inner(unit_id)')
    .eq('sections.unit_id', unitId);
  if (error) throw error;
  return data;
}

async function createTask(sectionId, name) {
  const { data: existing } = await db.from('tasks').select('position').eq('section_id', sectionId).order('position', { ascending: false }).limit(1);
  const nextPos = existing?.length ? existing[0].position + 1 : 0;
  const { data, error } = await db
    .from('tasks')
    .insert({ section_id: sectionId, name, position: nextPos })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateTask(id, fields) {
  const { error } = await db.from('tasks').update(fields).eq('id', id);
  if (error) throw error;
}

async function deleteTask(id) {
  const { error } = await db.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

// ── TASK STATES (checked / flagged / notes) ──────────────────

async function getTaskStates(unitId, sessionId) {
  const { data, error } = await db
    .from('task_states')
    .select('*')
    .eq('unit_id', unitId)
    .eq('session_id', sessionId);
  if (error) throw error;
  return data;
}

async function upsertTaskState(taskId, unitId, sessionId, fields) {
  const { error } = await db
    .from('task_states')
    .upsert({
      task_id: taskId,
      unit_id: unitId,
      session_id: sessionId,
      ...fields
    }, { onConflict: 'task_id,session_id' });
  if (error) throw error;
}

async function resetTaskStates(unitId, sessionId) {
  const { error } = await db
    .from('task_states')
    .delete()
    .eq('unit_id', unitId)
    .eq('session_id', sessionId);
  if (error) throw error;
}

async function getAllFlaggedTasks() {
  const { data, error } = await db
    .from('task_states')
    .select('*, tasks(name, section_id), sections:tasks(section_id(name, unit_id(name)))')
    .eq('flagged', true);
  if (error) throw error;
  return data;
}

async function getFlaggedTasksForUnit(unitId, sessionId) {
  const { data, error } = await db
    .from('task_states')
    .select('*, tasks(name, section_id, sections(name))')
    .eq('unit_id', unitId)
    .eq('session_id', sessionId)
    .eq('flagged', true);
  if (error) throw error;
  return data;
}

// ── IMAGES ───────────────────────────────────────────────────

async function uploadImage(taskId, file) {
  const ext = file.name.split('.').pop();
  const path = `tasks/${taskId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await db.storage
    .from('task-images')
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data } = db.storage.from('task-images').getPublicUrl(path);

  const { error: dbError } = await db
    .from('task_images')
    .insert({ task_id: taskId, url: data.publicUrl, path });
  if (dbError) throw dbError;

  return data.publicUrl;
}

async function getTaskImages(taskId) {
  const { data, error } = await db
    .from('task_images')
    .select('*')
    .eq('task_id', taskId);
  if (error) throw error;
  return data;
}

async function deleteImage(id, path) {
  await db.storage.from('task-images').remove([path]);
  const { error } = await db.from('task_images').delete().eq('id', id);
  if (error) throw error;
}

// ── SESSION MANAGEMENT ───────────────────────────────────────

async function getCurrentSession(unitId) {
  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('unit_id', unitId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function createSession(unitId) {
  const { data, error } = await db
    .from('sessions')
    .insert({ unit_id: unitId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getOrCreateSession(unitId) {
  let session = await getCurrentSession(unitId);
  if (!session) session = await createSession(unitId);
  return session;
}
