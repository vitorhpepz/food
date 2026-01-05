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
const entriesEl = document.getElementById('entries');
const totalsEl = document.getElementById('totals');

const foodsEl = document.getElementById('foods');
const weightEl = document.getElementById('weight');
const notesEl = document.getElementById('notes');
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
    status('Add a photo first.');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    status('Add your OpenAI API key above.');
    return;
  }

  analyzeBtn.disabled = true;
  status('Asking OpenAI…');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5.2',
        messages: [
          {
            role: 'system',
            content:
              'You are a nutrition assistant. Given a photo of food (often on a digital scale), extract the visible scale weight in grams and identify foods with a short note. Estimate macros for the pictured portion.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze the meal in this photo. Return ONLY JSON with keys: items (array of {name, note}), weight_grams (number or null), macros ({protein, carbs, fat, calories}), and confidence (0-1).'
              },
              { type: 'image_url', image_url: { url: currentImageData } }
            ]
          }
        ],
        max_tokens: 400
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to analyze');
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content?.trim() || '{}';
    let data = {};
    try {
      data = JSON.parse(content);
    } catch (err) {
      data = { raw: content, error: 'Could not parse JSON from OpenAI response' };
    }

    hydrateFormFromAnalysis(data);
    status('Analyzed. Review and adjust if needed.');
  } catch (err) {
    status(`Error: ${err.message}`);
  } finally {
    analyzeBtn.disabled = false;
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
    status('Add food description before saving.');
    return;
  }

  const entries = getEntries();
  entries.unshift(entry);
  localStorage.setItem('food-entries', JSON.stringify(entries));
  renderEntries(entries);
  status('Saved locally.');
  clearForm();
}

function clearAll() {
  if (!confirm('Delete all local entries?')) return;
  localStorage.removeItem('food-entries');
  renderEntries([]);
  status('Cleared.');
}

function loadEntries() {
  renderEntries(getEntries());
}

function renderEntries(entries) {
  entriesEl.innerHTML = '';
  totalsEl.innerHTML = '';

  if (!entries.length) {
    entriesEl.innerHTML = '<li class="entry">No entries yet.</li>';
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
        ${renderBadge('Protein', entry.macros?.protein)}
        ${renderBadge('Carbs', entry.macros?.carbs)}
        ${renderBadge('Fat', entry.macros?.fat)}
        ${renderBadge('Calories', entry.macros?.calories)}
      </div>
    `;

    entriesEl.appendChild(li);
  });

  ['protein', 'carbs', 'fat', 'calories'].forEach(key => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = `${capitalize(key)}: ${Math.round(totals[key])}`;
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
    keyStatus.textContent = 'Key cleared.';
    localStorage.removeItem('food-api-key');
    return;
  }
  localStorage.setItem('food-api-key', key);
  keyStatus.textContent = 'Saved locally.';
}

function loadApiKey() {
  const key = localStorage.getItem('food-api-key') || '';
  apiKeyInput.value = key;
  if (key) {
    keyStatus.textContent = 'Key loaded from local storage.';
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
