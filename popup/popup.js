// VocabMaster - Popup Script

const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
const exportBtn = document.getElementById('exportBtn');

let vocabData = {};
let currentAudio = null;

// Load and render vocabulary list
function loadWords() {
  chrome.runtime.sendMessage({ type: 'getVocabList' }, list => {
    vocabData = list || {};
    renderList();
  });
}

function renderList(filter = '') {
  const entries = Object.entries(vocabData)
    .filter(([key]) => !filter || key.includes(filter.toLowerCase()))
    .sort((a, b) => (b[1].addedAt || 0) - (a[1].addedAt || 0));

  const total = Object.keys(vocabData).length;
  countEl.textContent = `${total} word${total !== 1 ? 's' : ''}`;

  if (entries.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = total === 0 ? 'block' : 'none';
    if (total > 0 && filter) {
      listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#999">No matches found.</div>';
    }
    return;
  }

  emptyEl.style.display = 'none';
  listEl.innerHTML = entries.map(([key, item]) => {
    const def = getShortDef(item);
    return `
      <div class="word-item" data-word="${escapeHtml(key)}">
        <div class="word-info">
          <span class="word-name">${escapeHtml(item.word)}</span>
          <span class="word-phonetic">${escapeHtml(item.phonetic || '')}</span>
          <div class="word-def">${escapeHtml(def)}</div>
        </div>
        <div class="word-actions">
          <button class="btn-sound" title="Pronounce" data-word="${escapeHtml(item.word)}" data-audio="${escapeHtml(item.audioUrl || '')}">&#x1f50a;</button>
          <button class="btn-delete" title="Delete" data-word="${escapeHtml(key)}">&#x1f5d1;&#xfe0f;</button>
        </div>
      </div>
    `;
  }).join('');

  // Attach event listeners
  listEl.querySelectorAll('.btn-sound').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      pronounce(btn.dataset.word, btn.dataset.audio);
    });
  });

  listEl.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removeWord(btn.dataset.word);
    });
  });
}

function getShortDef(item) {
  if (!item.meanings || item.meanings.length === 0) return '';
  const m = item.meanings[0];
  return `(${m.partOfSpeech}) ${m.definitions?.[0] || ''}`;
}

function pronounce(word, audioUrl) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  if (audioUrl) {
    currentAudio = new Audio(audioUrl);
    currentAudio.play().catch(() => fallbackSpeak(word));
  } else {
    fallbackSpeak(word);
  }
}

function fallbackSpeak(word) {
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}

function removeWord(word) {
  chrome.runtime.sendMessage({ type: 'removeWord', word }, () => {
    delete vocabData[word];
    renderList(searchEl.value);
  });
}

// Export as CSV
function exportCSV() {
  const entries = Object.values(vocabData).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  if (entries.length === 0) return;

  const rows = [['Word', 'Phonetic', 'Definition']];
  entries.forEach(item => {
    const def = getShortDef(item);
    rows.push([item.word, item.phonetic || '', def]);
  });

  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `VocabMaster_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Event listeners
searchEl.addEventListener('input', () => renderList(searchEl.value));
exportBtn.addEventListener('click', exportCSV);

// Init
loadWords();
