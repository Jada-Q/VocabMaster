// VocabMaster - Background Service Worker

// Fetch word definition from Free Dictionary API
async function fetchDefinition(word) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const entry = data[0];
  const phonetic = entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '';
  const audioUrl = entry.phonetics?.find(p => p.audio)?.audio || '';

  const meanings = entry.meanings.map(m => ({
    partOfSpeech: m.partOfSpeech,
    definitions: m.definitions.slice(0, 2).map(d => d.definition)
  }));

  return { word: entry.word, phonetic, audioUrl, meanings };
}

// Get vocabulary list from storage
function getVocabList() {
  return new Promise(resolve => {
    chrome.storage.local.get({ vocabList: {} }, result => resolve(result.vocabList));
  });
}

// Save vocabulary list to storage
function saveVocabList(vocabList) {
  return chrome.storage.local.set({ vocabList });
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'lookup') {
    fetchDefinition(msg.word).then(result => sendResponse(result));
    return true; // keep channel open for async
  }

  if (msg.type === 'addWord') {
    getVocabList().then(list => {
      const key = msg.data.word.toLowerCase();
      list[key] = {
        word: msg.data.word,
        phonetic: msg.data.phonetic || '',
        meanings: msg.data.meanings || [],
        audioUrl: msg.data.audioUrl || '',
        addedAt: Date.now()
      };
      return saveVocabList(list);
    }).then(() => {
      // Notify all tabs to refresh highlights
      chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'vocabUpdated' }).catch(() => {});
        });
      });
      sendResponse({ success: true });
    });
    return true;
  }

  if (msg.type === 'removeWord') {
    getVocabList().then(list => {
      delete list[msg.word.toLowerCase()];
      return saveVocabList(list);
    }).then(() => {
      chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'vocabUpdated' }).catch(() => {});
        });
      });
      sendResponse({ success: true });
    });
    return true;
  }

  if (msg.type === 'getVocabList') {
    getVocabList().then(list => sendResponse(list));
    return true;
  }
});
