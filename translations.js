// ============================================================
// TRANSLATION MODULE
// Uses Claude API to translate UI strings to Spanish.
// Results cached in localStorage to avoid repeat API calls.
// ============================================================

const Translations = (() => {
  const CACHE_KEY = 'translation_cache_v1';
  let cache = {};
  let isSpanish = false;

  // Static UI strings (not user content)
  const UI_STRINGS = {
    en: {
      appName: 'CleanTrack',
      home: 'Home',
      units: 'Units',
      dashboard: 'Dashboard',
      logout: 'Log Out',
      ownerMode: 'Owner Mode',
      cleanerMode: 'Cleaner Mode',
      addUnit: 'Add Unit',
      addSection: 'Add Section',
      addTask: 'Add Task',
      reset: 'Reset Session',
      resetConfirm: 'Clear all check-ins and start a new cleaning session?',
      complete: 'complete',
      flagged: 'Flagged',
      flag: 'Flag',
      unflag: 'Unflag',
      note: 'Note',
      addNote: 'Add note...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      rename: 'Rename',
      photos: 'Photos',
      uploadPhoto: 'Upload Photo',
      viewPhotos: 'View Photos',
      noUnits: 'No units yet. Add your first unit.',
      noTasks: 'No tasks in this section.',
      noFlags: 'No flagged issues.',
      allUnits: 'All Units',
      flaggedIssues: 'Flagged Issues',
      progress: 'Progress',
      section: 'Section',
      task: 'Task',
      unit: 'Unit',
      moveUp: 'Move Up',
      moveDown: 'Move Down',
      enterPin: 'Enter PIN',
      incorrectPin: 'Incorrect PIN',
      login: 'Log In',
      welcomeBack: 'Welcome back',
      spanish: 'Español',
      english: 'English',
      loading: 'Loading...',
      error: 'Something went wrong.',
      confirmDelete: 'Are you sure you want to delete this?',
    },
    es: {} // filled by Claude API or cache
  };

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) cache = JSON.parse(raw);
    } catch (e) {
      cache = {};
    }
  }

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {}
  }

  async function translateBatch(strings) {
    // Check which ones are already cached
    const toTranslate = strings.filter(s => !cache[s]);
    if (toTranslate.length === 0) return;

    try {
      const prompt = `Translate the following UI strings from English to Spanish. 
Return ONLY a JSON object mapping each English string to its Spanish translation.
Keep translations concise — these are UI labels, not prose.
Do not add any explanation or markdown.

Strings to translate:
${JSON.stringify(toTranslate)}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || '{}';
      const clean = text.replace(/```json|```/g, '').trim();
      const translations = JSON.parse(clean);

      Object.assign(cache, translations);
      saveCache();
    } catch (e) {
      console.warn('Translation failed:', e);
    }
  }

  async function setLanguage(spanish) {
    isSpanish = spanish;
    localStorage.setItem('lang_pref', spanish ? 'es' : 'en');

    if (spanish) {
      const allStrings = Object.values(UI_STRINGS.en);
      await translateBatch(allStrings);
    }
  }

  function t(key) {
    const en = UI_STRINGS.en[key] || key;
    if (!isSpanish) return en;
    return cache[en] || en;
  }

  // Translate arbitrary user-generated text
  async function translateText(text) {
    if (!isSpanish) return text;
    if (cache[text]) return cache[text];
    await translateBatch([text]);
    return cache[text] || text;
  }

  function getIsSpanish() {
    return isSpanish;
  }

  function init() {
    loadCache();
    const saved = localStorage.getItem('lang_pref');
    if (saved === 'es') {
      isSpanish = true;
    }
  }

  return { init, setLanguage, t, translateText, getIsSpanish };
})();
