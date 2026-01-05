const photoInput = document.getElementById('photo-input');
const preview = document.getElementById('preview');
const previewImg = document.getElementById('preview-img');
const analyzeBtn = document.getElementById('analyze-btn');
const saveBtn = document.getElementById('save-btn');
const clearBtn = document.getElementById('clear-btn');
const statusEl = document.getElementById('status');
const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key-btn');
const keyStatus = document.getElementById('key-status');
const textAnalyzeBtn = document.getElementById('text-analyze-btn');
const voiceBtn = document.getElementById('voice-btn');
const entriesEl = document.getElementById('entries');
const totalsEl = document.getElementById('totals');

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

let currentImageData = null;

photoInput.addEventListener('change', handlePhoto);
analyzeBtn.addEventListener('click', analyzePhoto);
saveBtn.addEventListener('click', saveEntry);
clearBtn.addEventListener('click', clearAll);
saveKeyBtn.addEventListener('click', saveApiKey);
textAnalyzeBtn.addEventListener('click', analyzeFromText);
voiceBtn.addEventListener('click', startVoiceInput);
weightEl.addEventListener('input', recalcFromPer100);
[protein100El, carbs100El, fat100El, calories100El].forEach(el =>
  el.addEventListener('input', recalcFromPer100)
);

loadEntries();
loadApiKey();
registerServiceWorker();

function handlePhoto(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    currentImageData = reader.result;
    previewImg.src = currentImageData;
    preview.classList.remove('hidden');
    analyzeBtn.disabled = false;
    status('');
  };
  reader.readAsDataURL(file);
}

async function analyzePhoto() {
  if (!currentImageData) {
    status('Adicione uma foto primeiro.');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    status('Informe sua API key da OpenAI acima.');
    return;
  }

  analyzeBtn.disabled = true;
  status('Perguntando para a OpenAI…');

  try {
    const data = await sendOpenAi([
      {
        role: 'system',
        content:
          'Você é um assistente de nutrição. Dada uma foto de comida (geralmente em uma balança), extraia o peso visível em gramas e identifique os alimentos com uma nota curta. Estime macros para a porção da foto. Responda em português. Retorne apenas JSON.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analise a refeição nesta foto. Retorne SOMENTE JSON com: items (array de {name, note}), weight_grams (número ou null), macros ({protein, carbs, fat, calories}), confidence (0-1).'
          },
          { type: 'image_url', image_url: { url: currentImageData } }
        ]
      }
    ], apiKey);
    hydrateFormFromAnalysis(data);
    status('Analisado. Revise e ajuste se precisar.');
  } catch (err) {
    status(`Erro: ${err.message}`);
  } finally {
    analyzeBtn.disabled = false;
  }
}

async function analyzeFromText() {
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
  status('Recalculando macros pelo texto…');

  const weight = numberOrNull(weightEl.value);

  try {
    const data = await sendOpenAi(
      [
        {
          role: 'system',
          content:
            'Você é um assistente de nutrição. Com base apenas no texto, estime macros para a refeição descrita. Se houver peso informado, considere-o para estimar a porção. Responda em português e retorne apenas JSON.'
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
      apiKey
    );

    hydrateFormFromAnalysis(data);
    status('Macros recalculadas pelo texto.');
  } catch (err) {
    status(`Erro: ${err.message}`);
  } finally {
    textAnalyzeBtn.disabled = false;
  }
}

function hydrateFormFromAnalysis(data) {
  const items = data.items || data.raw?.items || [];
  const foods = items.map(item => item.name || '').filter(Boolean).join(', ');
  foodsEl.value = foods;
  weightEl.value = data.weight_grams ?? '';
  notesEl.value = items.map(i => i.note).filter(Boolean).join(' • ');
  proteinEl.value = data.macros?.protein ?? '';
  carbsEl.value = data.macros?.carbs ?? '';
  fatEl.value = data.macros?.fat ?? '';
  caloriesEl.value = data.macros?.calories ?? '';

  const weight = numberOrNull(weightEl.value);
  if (weight && data.macros) {
    protein100El.value = backcalcPer100(data.macros.protein, weight);
    carbs100El.value = backcalcPer100(data.macros.carbs, weight);
    fat100El.value = backcalcPer100(data.macros.fat, weight);
    calories100El.value = backcalcPer100(data.macros.calories, weight);
  }
}

function saveEntry() {
  const entry = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    foods: foodsEl.value.trim(),
    weightGrams: numberOrNull(weightEl.value),
    macros: {
      protein: numberOrNull(proteinEl.value),
      carbs: numberOrNull(carbsEl.value),
      fat: numberOrNull(fatEl.value),
      calories: numberOrNull(caloriesEl.value)
    },
    notes: notesEl.value.trim()
  };

  if (!entry.foods) {
    status('Descreva os alimentos antes de salvar.');
    return;
  }

  const entries = getEntries();
  entries.unshift(entry);
  localStorage.setItem('food-entries', JSON.stringify(entries));
  renderEntries(entries);
  status('Salvo localmente.');
  clearForm();
}

function clearAll() {
  if (!confirm('Apagar todos os registros locais?')) return;
  localStorage.removeItem('food-entries');
  renderEntries([]);
  status('Tudo apagado.');
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

  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = entries.filter(e => (e.createdAt || '').startsWith(today));
  const targetEntries = todayEntries.length ? todayEntries : entries;

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
    const date = new Date(entry.createdAt || entry.id).toLocaleString();

    li.innerHTML = `
      <div class="meta">${date}${entry.weightGrams ? ` • ${entry.weightGrams} g` : ''}${entry.notes ? ` • ${entry.notes}` : ''}</div>
      <div class="foods">${entry.foods}</div>
      <div class="macros">
        ${renderBadge('Proteína', entry.macros?.protein)}
        ${renderBadge('Carbo', entry.macros?.carbs)}
        ${renderBadge('Gordura', entry.macros?.fat)}
        ${renderBadge('Calorias', entry.macros?.calories)}
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
    analyzeBtn.disabled = false;
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
  preview.classList.add('hidden');
  photoInput.value = '';
  currentImageData = null;
  analyzeBtn.disabled = true;
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

  rec.onstart = () => status('Escutando… descreva o prato e o peso.');
  rec.onerror = event => status(`Erro no ditado: ${event.error || 'desconhecido'}`);
  rec.onend = () => {
    voiceBtn.disabled = false;
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
    }
  };

  voiceBtn.disabled = true;
  rec.start();
}

async function sendOpenAi(messages, apiKey) {
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
    const errText = await response.text();
    throw new Error(errText || 'Falha ao analisar');
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content?.trim() || '{}';
  let data = {};
  try {
    data = JSON.parse(content);
  } catch (err) {
    data = { raw: content, error: 'Não foi possível ler JSON da resposta da OpenAI' };
  }

  return data;
}
