const saveBtn = document.getElementById('save-btn');
const statusEl = document.getElementById('status');
const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key-btn');
const keyStatus = document.getElementById('key-status');
const textAnalyzeBtn = document.getElementById('text-analyze-btn');
const voiceBtn = document.getElementById('voice-btn');
const toggleEditBtn = document.getElementById('toggle-edit-btn');
const editTitle = document.getElementById('edit-title');
const entriesEl = document.getElementById('entries');
const totalsEl = document.getElementById('totals');
const editOverlay = document.getElementById('edit-overlay');
const closeEditBtn = document.getElementById('close-edit-btn');
const reanalyzeBtn = document.getElementById('reanalyze-btn');
const reapplyBtn = document.getElementById('reapply-btn');
const dateFilter = document.getElementById('date-filter');

const foodsEl = document.getElementById('foods');
const weightEl = document.getElementById('weight');
const notesEl = document.getElementById('notes');
const protein100El = document.getElementById('protein100');
const carbs100El = document.getElementById('carbs100');
const fat100El = document.getElementById('fat100');
const calories100El = document.getElementById('calories100');
const proteinEl = document.getElementById('protein');
const carbsEl = document.getElementById('carbs');
const fatEl = document.getElementById('fat');
const caloriesEl = document.getElementById('calories');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.querySelector('#loading-overlay .loading-text');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');
const backupReminder = document.getElementById('backup-reminder');
const backupNowBtn = document.getElementById('backup-now-btn');
const backupLaterBtn = document.getElementById('backup-later-btn');
const nutriOverlay = document.getElementById('nutri-overlay');
const closeNutriBtn = document.getElementById('close-nutri-btn');
const nutriGoal = document.getElementById('nutri-goal');
const nutriGoalCustom = document.getElementById('nutri-goal-custom');
const nutriQuestion = document.getElementById('nutri-question');
const nutriPeriod = document.getElementById('nutri-period');
const nutriSendBtn = document.getElementById('nutri-send-btn');
const nutriSaveGoalBtn = document.getElementById('nutri-save-goal-btn');
const nutriOutput = document.getElementById('nutri-output');
const reviewDayBtn = document.getElementById('review-day-btn');
const reviewWeekBtn = document.getElementById('review-week-btn');
const reviewMonthBtn = document.getElementById('review-month-btn');
const goalsDisplay = document.getElementById('goals-display');

let editingId = null;
let selectedDate = new Date().toISOString().slice(0, 10);
let lastAnalysisData = null;
let goalsState = loadGoals();

saveBtn.addEventListener('click', () => saveEntry());
saveKeyBtn.addEventListener('click', saveApiKey);
textAnalyzeBtn.addEventListener('click', () => analyzeFromText({ autoSave: false }));
voiceBtn.addEventListener('click', startVoiceInput);
toggleEditBtn.addEventListener('click', () => {
  clearForm();
  setEditTitle('Nova refeição');
  showEditOverlay(true);
});
closeEditBtn.addEventListener('click', () => showEditOverlay(false));
reanalyzeBtn.addEventListener('click', () => analyzeFromText({ autoSave: false }));
reapplyBtn.addEventListener('click', () => {
  if (!lastAnalysisData) {
    status('Nenhuma análise recente para aplicar.');
    return;
    }
  hydrateFormFromAnalysis(lastAnalysisData);
  status('Campos atualizados do último resultado.');
});
dateFilter.addEventListener('change', () => {
  selectedDate = dateFilter.value || new Date().toISOString().slice(0, 10);
  renderEntries(getEntries());
});
exportBtn?.addEventListener('click', exportBackup);
importBtn?.addEventListener('click', () => importFile?.click());
importFile?.addEventListener('change', handleImport);
backupNowBtn?.addEventListener('click', () => {
  exportBackup();
  setLastBackupNow();
  hideBackupReminder();
});
backupLaterBtn?.addEventListener('click', () => {
  setBackupSnooze();
  hideBackupReminder();
});
closeNutriBtn?.addEventListener('click', () => showNutriOverlay(false));
nutriSendBtn?.addEventListener('click', () => sendNutriQuestion());
nutriSaveGoalBtn?.addEventListener('click', () => {
  saveGoalsState();
  status('Objetivos salvos.');
});
reviewDayBtn?.addEventListener('click', () => openNutriWithPeriod('day'));
reviewWeekBtn?.addEventListener('click', () => openNutriWithPeriod('week'));
reviewMonthBtn?.addEventListener('click', () => openNutriWithPeriod('month'));
weightEl.addEventListener('input', recalcFromPer100);
[protein100El, carbs100El, fat100El, calories100El].forEach(el =>
  el.addEventListener('input', recalcFromPer100)
);

entriesEl.addEventListener('click', event => {
  const li = event.target.closest('li.entry');
  if (!li) return;
  const id = Number(li.dataset.id);
  if (event.target.closest('.delete-btn')) {
    deleteEntry(id);
    return;
  }
  startEditEntry(id);
});

loadEntries();
loadApiKey();
dateFilter.value = selectedDate;
renderGoalsDisplay();
maybeShowBackupReminder();
registerServiceWorker();

async function analyzeFromText(options = {}) {
  const foods = foodsEl.value.trim();
  if (!foods) {
    status('Descreva os alimentos para recalcular.');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    status('Informe sua API key da OpenAI acima.');
    return;
  }

  textAnalyzeBtn.disabled = true;

  const weight = numberOrNull(weightEl.value);

  try {
    const data = await sendOpenAi(
      [
        {
          role: 'system',
          content:
            'Você é um assistente de nutrição. Com base apenas no texto, estime macros para a refeição descrita, considerando a tabela TACO. Se houver peso informado, considere-o para estimar a porção. Responda em português e retorne apenas JSON.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Refeição: ${foods}. Peso: ${weight ? weight + ' g' : 'desconhecido'}. Retorne SOMENTE JSON com: items (array de {name, note}), weight_grams (número ou null), macros ({protein, carbs, fat, calories}), confidence (0-1).`
            }
          ]
        }
      ],
      apiKey,
      'Analisando na OpenAI…'
    );

    hydrateFormFromAnalysis(data);
    lastAnalysisData = data;
    status('Macros recalculadas pelo texto.');
    if (options.autoSave) {
      saveEntry();
    }
  } catch (err) {
    status(`Erro: ${err.message}`);
  } finally {
    textAnalyzeBtn.disabled = false;
  }
}

function hydrateFormFromAnalysis(data) {
  const items = data.items || data.raw?.items || [];
  const foods = items.map(item => item.name || '').filter(Boolean).join(', ');
  if (foods) {
    foodsEl.value = foods;
  }
  if (data.weight_grams != null && Number.isFinite(Number(data.weight_grams))) {
    weightEl.value = data.weight_grams;
  }
  const incomingNotes = items.map(i => i.note).filter(Boolean).join(' • ');
  if (incomingNotes) {
    notesEl.value = incomingNotes;
  }
  proteinEl.value = data.macros?.protein ?? '';
  carbsEl.value = data.macros?.carbs ?? '';
  fatEl.value = data.macros?.fat ?? '';
  caloriesEl.value = data.macros?.calories ?? '';

  const weight = numberOrNull(weightEl.value);
  if (data.macros100) {
    protein100El.value = data.macros100.protein ?? '';
    carbs100El.value = data.macros100.carbs ?? '';
    fat100El.value = data.macros100.fat ?? '';
    calories100El.value = data.macros100.calories ?? '';
  } else if (weight && data.macros) {
    protein100El.value = backcalcPer100(data.macros.protein, weight);
    carbs100El.value = backcalcPer100(data.macros.carbs, weight);
    fat100El.value = backcalcPer100(data.macros.fat, weight);
    calories100El.value = backcalcPer100(data.macros.calories, weight);
  }
}

function saveEntry() {
  const entryDate = selectedDate || new Date().toISOString().slice(0, 10);
  const entryCreatedAt = editingId
    ? getEntries().find(e => e.id === editingId)?.createdAt
    : new Date(`${entryDate}T00:00:00`).toISOString();

  const entry = {
    id: editingId || Date.now(),
    createdAt: entryCreatedAt || new Date(`${entryDate}T00:00:00`).toISOString(),
    foods: foodsEl.value.trim(),
    weightGrams: numberOrNull(weightEl.value),
    macros: {
      protein: numberOrNull(proteinEl.value),
      carbs: numberOrNull(carbsEl.value),
      fat: numberOrNull(fatEl.value),
      calories: numberOrNull(caloriesEl.value)
    },
    macros100: {
      protein: numberOrNull(protein100El.value),
      carbs: numberOrNull(carbs100El.value),
      fat: numberOrNull(fat100El.value),
      calories: numberOrNull(calories100El.value)
    },
    notes: notesEl.value.trim()
  };

  if (!entry.foods) {
    status('Descreva os alimentos antes de salvar.');
    return;
  }

  const entries = getEntries();
  const existingIndex = entries.findIndex(e => e.id === entry.id);
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.unshift(entry);
  }

  localStorage.setItem('food-entries', JSON.stringify(entries));
  renderEntries(entries);
  status('Salvo localmente.');
  clearForm();
  showEditPanel(false);
}

function clearAll() {
}

function loadEntries() {
  renderEntries(getEntries());
}

function renderEntries(entries) {
  entriesEl.innerHTML = '';
  totalsEl.innerHTML = '';

  if (!entries.length) {
    entriesEl.innerHTML = '<li class="entry">Nenhum registro ainda.</li>';
    return;
  }

  const targetEntries = entries.filter(e => (e.createdAt || '').slice(0, 10) === selectedDate);

  const totals = { protein: 0, carbs: 0, fat: 0, calories: 0 };

  targetEntries.forEach(entry => {
    if (entry.macros) {
      totals.protein += entry.macros.protein || 0;
      totals.carbs += entry.macros.carbs || 0;
      totals.fat += entry.macros.fat || 0;
      totals.calories += entry.macros.calories || 0;
    }

    const li = document.createElement('li');
    li.className = 'entry';
    li.dataset.id = entry.id;
    const date = new Date(entry.createdAt || entry.id).toLocaleString();
    const per100 = entry.macros100 || {};
    const titleLine = [entry.foods, entry.weightGrams ? `${entry.weightGrams} g` : '', date].filter(Boolean).join(' • ');

    li.innerHTML = `
      <div class="meta">${titleLine}</div>
      ${entry.notes ? `<div class="notes">${entry.notes}</div>` : ''}
      <div class="macros">
        ${renderBadge('Proteína', entry.macros?.protein)}
        ${renderBadge('Carbo', entry.macros?.carbs)}
        ${renderBadge('Gordura', entry.macros?.fat)}
        ${renderBadge('Calorias', entry.macros?.calories)}
      </div>
      ${(per100.protein || per100.carbs || per100.fat || per100.calories) ? `
        <div class="per100-line">Por 100g: ${per100.protein ?? '-'}P • ${per100.carbs ?? '-'}C • ${per100.fat ?? '-'}G • ${per100.calories ?? '-'} kcal</div>
      ` : ''}
      <div class="actions">
        <button class="button secondary small edit-btn" type="button">Editar</button>
        <button class="button danger small delete-btn" type="button">Excluir</button>
      </div>
    `;

    entriesEl.appendChild(li);
  });

  const labels = {
    protein: 'Proteína',
    carbs: 'Carbo',
    fat: 'Gordura',
    calories: 'Calorias'
  };

  Object.keys(labels).forEach(key => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = `${labels[key]}: ${Math.round(totals[key])}`;
    totalsEl.appendChild(chip);
  });
}

function renderBadge(label, value) {
  if (value == null || Number.isNaN(value)) return '';
  return `<span class="badge">${label}: ${value}</span>`;
}

function getEntries() {
  try {
    return JSON.parse(localStorage.getItem('food-entries') || '[]');
  } catch (err) {
    return [];
  }
}

function saveApiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    keyStatus.textContent = 'Chave apagada.';
    localStorage.removeItem('food-api-key');
    return;
  }
  localStorage.setItem('food-api-key', key);
  keyStatus.textContent = 'Chave salva localmente.';
}

function loadApiKey() {
  const key = localStorage.getItem('food-api-key') || '';
  apiKeyInput.value = key;
  if (key) {
    keyStatus.textContent = 'Chave recuperada do armazenamento local.';
  }
}

function getApiKey() {
  return (localStorage.getItem('food-api-key') || '').trim();
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clearForm() {
  foodsEl.value = '';
  weightEl.value = '';
  notesEl.value = '';
  proteinEl.value = '';
  carbsEl.value = '';
  fatEl.value = '';
  caloriesEl.value = '';
  protein100El.value = '';
  carbs100El.value = '';
  fat100El.value = '';
  calories100El.value = '';
  editingId = null;
}

function status(text) {
  statusEl.textContent = text;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (err) {
    console.warn('SW registration failed', err);
  }
}

function recalcFromPer100() {
  const weight = numberOrNull(weightEl.value);
  if (!weight || weight <= 0) return;
  const ratio = weight / 100;
  proteinEl.value = scaleValue(protein100El.value, ratio);
  carbsEl.value = scaleValue(carbs100El.value, ratio);
  fatEl.value = scaleValue(fat100El.value, ratio);
  caloriesEl.value = scaleValue(calories100El.value, ratio);
}

function scaleValue(val, ratio) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '';
  return +(n * ratio).toFixed(1);
}

function backcalcPer100(portionValue, weight) {
  const n = Number(portionValue);
  if (!Number.isFinite(n) || !weight) return '';
  return +(n / weight * 100).toFixed(1);
}

function startVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    status('Ditado por voz não é suportado neste navegador.');
    return;
  }

  const rec = new Recognition();
  rec.lang = 'pt-BR';
  rec.continuous = false;
  rec.interimResults = false;

  rec.onstart = () => setLoading(true, 'Escutando… descreva o prato e o peso.');
  rec.onerror = event => status(`Erro no ditado: ${event.error || 'desconhecido'}`);
  rec.onend = () => {
    voiceBtn.disabled = false;
    setLoading(false);
  };
  rec.onresult = event => {
    const transcript = Array.from(event.results)
      .map(r => r[0].transcript)
      .join(' ')
      .trim();
    if (transcript) {
      foodsEl.value = foodsEl.value
        ? `${foodsEl.value.trim()}, ${transcript}`
        : transcript;
      status('Transcrição adicionada ao campo de alimentos.');
      analyzeFromText({ autoSave: true });
    }
  };

  voiceBtn.disabled = true;
  rec.start();
}

async function sendOpenAi(messages, apiKey, loadingMessage = 'Analisando na OpenAI…') {
  setLoading(true, loadingMessage);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-5.2',
      messages,
      max_completion_tokens: 400
    })
  });

  if (!response.ok) {
    setLoading(false);
    const errText = await response.text();
    throw new Error(errText || 'Falha ao analisar');
  }

  const payload = await response.json();
  setLoading(false);
  const content = payload.choices?.[0]?.message?.content?.trim() || '{}';
  let data = {};
  try {
    data = JSON.parse(content);
  } catch (err) {
    data = { raw: content, error: 'Não foi possível ler JSON da resposta da OpenAI' };
  }

  return data;
}

function setLoading(isLoading, message = '') {
  if (isLoading) {
    loadingOverlay.classList.remove('hidden');
    if (loadingText) loadingText.textContent = message || 'Carregando…';
  } else {
    loadingOverlay.classList.add('hidden');
  }
}

function showEditOverlay(show) {
  if (!editOverlay) return;
  if (show) {
    editOverlay.classList.remove('hidden');
  } else {
    editOverlay.classList.add('hidden');
  }
}

function deleteEntry(id) {
  const entries = getEntries().filter(e => e.id !== id);
  localStorage.setItem('food-entries', JSON.stringify(entries));
  renderEntries(entries);
  status('Registro excluído.');
}

function setEditTitle(text) {
  if (editTitle) {
    editTitle.textContent = text;
  }
}

function exportBackup() {
  const entries = getEntries();
  if (!entries.length) {
    status('Nada para exportar.');
    return;
  }
  const payload = {
    meta: {
      exported_at: new Date().toISOString(),
      count: entries.length,
      app: 'nutriA'
    },
    entries
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `nutria-backup-${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setLastBackupNow();
  status('Backup salvo (arquivo JSON baixado).');
}

function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const entries = Array.isArray(data.entries) ? data.entries : data;
      if (!Array.isArray(entries)) throw new Error('Formato inválido');
      if (!confirm('Substituir registros atuais pelo backup?')) return;
      localStorage.setItem('food-entries', JSON.stringify(entries));
      renderEntries(entries);
      status('Backup importado e aplicado.');
      setLastBackupNow();
    } catch (err) {
      status(`Erro ao importar: ${err.message}`);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

function maybeShowBackupReminder() {
  if (!backupReminder) return;
  const entries = getEntries();
  if (!entries.length) return;
  const lastBackup = localStorage.getItem('food-last-backup');
  const snoozeUntil = localStorage.getItem('food-backup-snooze');
  const now = Date.now();
  if (snoozeUntil && now < Number(snoozeUntil)) return;
  if (lastBackup && now - Date.parse(lastBackup) < 7 * 24 * 60 * 60 * 1000) return;
  backupReminder.classList.remove('hidden');
}

function hideBackupReminder() {
  backupReminder?.classList.add('hidden');
}

function setLastBackupNow() {
  localStorage.setItem('food-last-backup', new Date().toISOString());
}

function setBackupSnooze() {
  const day = 24 * 60 * 60 * 1000;
  localStorage.setItem('food-backup-snooze', String(Date.now() + day));
}

function openNutriWithPeriod(period) {
  if (nutriPeriod) nutriPeriod.value = period;
  showNutriOverlay(true);
}

function showNutriOverlay(show) {
  if (!nutriOverlay) return;
  if (show) {
    nutriOverlay.classList.remove('hidden');
    nutriGoal.value = goalsState.goal || '';
    nutriGoalCustom.value = goalsState.goalCustom || '';
    nutriQuestion.value = '';
    nutriOutput.textContent = '';
  } else {
    nutriOverlay.classList.add('hidden');
  }
}

function saveGoalsState() {
  goalsState = {
    goal: nutriGoal.value,
    goalCustom: nutriGoalCustom.value
  };
  localStorage.setItem('nutria-goals', JSON.stringify(goalsState));
  renderGoalsDisplay();
}

function loadGoals() {
  try {
    return JSON.parse(localStorage.getItem('nutria-goals') || '{}') || {};
  } catch {
    return {};
  }
}

function renderGoalsDisplay() {
  if (!goalsDisplay) return;
  const parts = [];
  if (goalsState.goal) parts.push(goalsState.goal);
  if (goalsState.goalCustom) parts.push(goalsState.goalCustom);
  goalsDisplay.textContent = parts.length ? `Objetivos: ${parts.join(' • ')}` : 'Objetivos: não definidos.';
}

async function sendNutriQuestion() {
  const apiKey = getApiKey();
  if (!apiKey) {
    status('Informe sua API key da OpenAI acima.');
    return;
  }
  const period = nutriPeriod?.value || 'day';
  const question = nutriQuestion?.value?.trim() || 'Faça uma revisão do período.';
  saveGoalsState();

  const entries = getEntriesForPeriod(period);
  const summary = entries
    .map(e => {
      const date = (e.createdAt || e.id || '').slice(0, 10);
      return `${date}: ${e.foods} (${e.weightGrams || '-'} g) P:${e.macros?.protein || '-'} C:${e.macros?.carbs || '-'} G:${e.macros?.fat || '-'} Cal:${e.macros?.calories || '-'}`;
    })
    .join('\n');

  try {
    const data = await sendOpenAi(
      [
        {
          role: 'system',
          content:
            'Você é uma nutricionista que segue a tabela TACO. Dê feedback prático, sucinto, em português, com foco em ajustes de macros e hábitos.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Objetivo: ${goalsState.goal || 'não definido'} ${goalsState.goalCustom || ''}\nPeríodo: ${period}\nPergunta: ${question}\nRegistros:\n${summary || 'sem registros'}.`
            }
          ]
        }
      ],
      apiKey,
      'Analisando com nutricionista IA…'
    );

    const answer = typeof data === 'string' ? data : JSON.stringify(data);
    nutriOutput.textContent = data.raw || data.answer || answer;
  } catch (err) {
    nutriOutput.textContent = `Erro: ${err.message}`;
  }
}

function getEntriesForPeriod(period) {
  const all = getEntries();
  if (!all.length) return [];
  const today = selectedDate || new Date().toISOString().slice(0, 10);
  const start = new Date(today);
  if (period === 'week') {
    start.setDate(start.getDate() - 6);
  } else if (period === 'month') {
    start.setDate(start.getDate() - 29);
  }
  const startStr = start.toISOString().slice(0, 10);
  return all.filter(e => {
    const d = (e.createdAt || '').slice(0, 10);
    return d >= startStr && d <= today;
  });
}

function startEditEntry(id) {
  const entries = getEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  setEditTitle('Editar refeição');
  showEditOverlay(true);
  foodsEl.value = entry.foods || '';
  weightEl.value = entry.weightGrams ?? '';
  notesEl.value = entry.notes || '';
  proteinEl.value = entry.macros?.protein ?? '';
  carbsEl.value = entry.macros?.carbs ?? '';
  fatEl.value = entry.macros?.fat ?? '';
  caloriesEl.value = entry.macros?.calories ?? '';
  protein100El.value = entry.macros100?.protein ?? '';
  carbs100El.value = entry.macros100?.carbs ?? '';
  fat100El.value = entry.macros100?.fat ?? '';
  calories100El.value = entry.macros100?.calories ?? '';
  status('Editando registro selecionado. Salve para aplicar.');
}
