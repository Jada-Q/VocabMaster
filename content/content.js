// VocabMaster - Content Script
(function () {
  'use strict';

  let vocabList = {};
  let popupEl = null;
  let currentAudio = null;

  // ─── Initialization ───────────────────────────────────────────────

  function init() {
    loadVocabList().then(() => {
      highlightVocabWords();
      setupSelectionListener();
      if (isYouTube()) setupYouTubeObserver();
    });
  }

  function loadVocabList() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'getVocabList' }, list => {
        vocabList = list || {};
        resolve();
      });
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'vocabUpdated') {
      loadVocabList().then(() => {
        clearHighlights();
        highlightVocabWords();
        if (isYouTube()) refreshYouTubeHighlights();
      });
    }
  });

  // ─── Translation Popup ────────────────────────────────────────────

  function createPopup() {
    if (popupEl) popupEl.remove();
    popupEl = document.createElement('div');
    popupEl.id = 'vm-popup';
    popupEl.innerHTML = `
      <div class="vm-popup-header">
        <span class="vm-word"></span>
        <span class="vm-phonetic"></span>
        <button class="vm-btn vm-btn-sound" title="Pronounce">&#x1f50a;</button>
        <button class="vm-btn vm-btn-star" title="Add to vocabulary">&#x2b50;</button>
        <button class="vm-btn vm-btn-close" title="Close">&times;</button>
      </div>
      <div class="vm-popup-body">
        <div class="vm-loading">Looking up...</div>
        <div class="vm-meanings"></div>
        <div class="vm-error" style="display:none">No definition found.</div>
      </div>
    `;
    document.body.appendChild(popupEl);

    popupEl.querySelector('.vm-btn-close').addEventListener('click', closePopup);
    popupEl.querySelector('.vm-btn-sound').addEventListener('click', handlePronounce);
    popupEl.querySelector('.vm-btn-star').addEventListener('click', handleStar);

    // Prevent popup clicks from triggering page events
    popupEl.addEventListener('mousedown', e => e.stopPropagation());
    popupEl.addEventListener('click', e => e.stopPropagation());

    return popupEl;
  }

  function showPopup(word, x, y) {
    const popup = createPopup();
    popup.querySelector('.vm-word').textContent = word;
    popup.querySelector('.vm-meanings').innerHTML = '';
    popup.querySelector('.vm-loading').style.display = 'block';
    popup.querySelector('.vm-error').style.display = 'none';

    // Position
    popup.style.display = 'block';
    const rect = popup.getBoundingClientRect();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let left = x + window.scrollX;
    let top = y + window.scrollY + 10;

    if (x + rect.width > viewW - 10) left = viewW - rect.width - 10 + window.scrollX;
    if (y + rect.height + 20 > viewH) top = y + window.scrollY - rect.height - 10;
    if (left < 5) left = 5;

    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    // Mark star if already in vocab
    const key = word.toLowerCase();
    if (vocabList[key]) {
      popup.querySelector('.vm-btn-star').classList.add('vm-starred');
      popup.querySelector('.vm-btn-star').title = 'Already in vocabulary';
    }

    // Lookup
    popup.dataset.word = word;
    chrome.runtime.sendMessage({ type: 'lookup', word }, result => {
      if (chrome.runtime.lastError || !popup.isConnected) return;
      popup.querySelector('.vm-loading').style.display = 'none';

      if (!result) {
        popup.querySelector('.vm-error').style.display = 'block';
        return;
      }

      popup.querySelector('.vm-phonetic').textContent = result.phonetic;
      popup.dataset.audioUrl = result.audioUrl || '';
      popup.dataset.phonetic = result.phonetic || '';
      popup.dataset.meaningsJson = JSON.stringify(result.meanings);

      const meaningsEl = popup.querySelector('.vm-meanings');
      result.meanings.forEach(m => {
        const div = document.createElement('div');
        div.className = 'vm-meaning';
        div.innerHTML = `<span class="vm-pos">${m.partOfSpeech}</span>`;
        m.definitions.forEach(d => {
          const dd = document.createElement('div');
          dd.className = 'vm-def';
          dd.textContent = d;
          div.appendChild(dd);
        });
        meaningsEl.appendChild(div);
      });
    });
  }

  function closePopup() {
    if (popupEl) {
      popupEl.remove();
      popupEl = null;
    }
  }

  function handlePronounce() {
    if (!popupEl) return;
    const audioUrl = popupEl.dataset.audioUrl;
    const word = popupEl.dataset.word;

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

  function handleStar() {
    if (!popupEl) return;
    const word = popupEl.dataset.word;
    const key = word.toLowerCase();
    const btn = popupEl.querySelector('.vm-btn-star');

    if (vocabList[key]) return; // already added

    const data = {
      word,
      phonetic: popupEl.dataset.phonetic || '',
      audioUrl: popupEl.dataset.audioUrl || '',
      meanings: JSON.parse(popupEl.dataset.meaningsJson || '[]')
    };

    chrome.runtime.sendMessage({ type: 'addWord', data }, () => {
      btn.classList.add('vm-starred');
      btn.title = 'Already in vocabulary';
      vocabList[key] = data;
    });
  }

  // ─── Selection Listener (划词翻译) ────────────────────────────────

  function setupSelectionListener() {
    document.addEventListener('mouseup', e => {
      // Ignore clicks inside our popup
      if (e.target.closest('#vm-popup')) return;

      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim();

        if (text && /^[a-zA-Z'-]+$/.test(text) && text.length > 1 && text.length < 30) {
          showPopup(text, e.clientX, e.clientY);
        } else if (!e.target.closest('#vm-popup') && !e.target.closest('.vm-yt-word')) {
          closePopup();
        }
      }, 10);
    });

    document.addEventListener('mousedown', e => {
      if (!e.target.closest('#vm-popup')) {
        closePopup();
      }
    });
  }

  // ─── Vocab Word Highlighting ──────────────────────────────────────

  const HIGHLIGHT_CLASS = 'vm-highlight';
  const HIGHLIGHT_ATTR = 'data-vm-highlighted';

  function highlightVocabWords() {
    const words = Object.keys(vocabList);
    if (words.length === 0) return;

    const regex = new RegExp(`\\b(${words.map(escapeRegex).join('|')})\\b`, 'gi');
    walkTextNodes(document.body, regex);
  }

  function walkTextNodes(root, regex) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // Skip our own elements, scripts, styles, inputs, etc.
        if (parent.closest('#vm-popup, .vm-yt-word, script, style, textarea, input, [contenteditable]')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.hasAttribute(HIGHLIGHT_ATTR)) return NodeFilter.FILTER_REJECT;
        if (regex.test(node.textContent)) {
          regex.lastIndex = 0;
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(textNode => {
      const fragment = document.createDocumentFragment();
      const text = textNode.textContent;
      let lastIndex = 0;
      regex.lastIndex = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const span = document.createElement('span');
        span.className = HIGHLIGHT_CLASS;
        span.setAttribute(HIGHLIGHT_ATTR, 'true');
        span.textContent = match[0];
        span.title = getShortDef(match[0].toLowerCase());
        fragment.appendChild(span);
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      textNode.parentNode.replaceChild(fragment, textNode);
    });
  }

  function clearHighlights() {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => {
      const text = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(text, el);
    });
    // Merge adjacent text nodes
    document.body.normalize();
  }

  function getShortDef(word) {
    const entry = vocabList[word];
    if (!entry || !entry.meanings || entry.meanings.length === 0) return '';
    const m = entry.meanings[0];
    return `(${m.partOfSpeech}) ${m.definitions[0] || ''}`;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ─── YouTube Subtitle Enhancement ────────────────────────────────

  function isYouTube() {
    return location.hostname.includes('youtube.com');
  }

  let ytObserver = null;

  function setupYouTubeObserver() {
    // Watch for caption container to appear
    const bodyObserver = new MutationObserver(() => {
      const captionWindow = document.querySelector('.caption-window');
      if (captionWindow && !ytObserver) {
        observeCaptions(captionWindow);
      }
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Also check if captions already exist
    const existing = document.querySelector('.caption-window');
    if (existing) observeCaptions(existing);
  }

  function observeCaptions(captionWindow) {
    ytObserver = new MutationObserver(() => {
      const segments = captionWindow.querySelectorAll('.ytp-caption-segment');
      segments.forEach(seg => {
        if (seg.dataset.vmProcessed) return;
        seg.dataset.vmProcessed = 'true';
        processCaption(seg);
      });
    });

    ytObserver.observe(captionWindow, { childList: true, subtree: true, characterData: true });

    // Process existing segments
    captionWindow.querySelectorAll('.ytp-caption-segment').forEach(seg => {
      if (!seg.dataset.vmProcessed) {
        seg.dataset.vmProcessed = 'true';
        processCaption(seg);
      }
    });
  }

  function processCaption(segment) {
    const text = segment.textContent;
    if (!text.trim()) return;

    const fragment = document.createDocumentFragment();
    // Split by whitespace, keeping separators
    const parts = text.split(/(\s+)/);

    parts.forEach(part => {
      if (/^\s+$/.test(part)) {
        fragment.appendChild(document.createTextNode(part));
        return;
      }

      const span = document.createElement('span');
      span.className = 'vm-yt-word';
      span.textContent = part;

      // Highlight if in vocab
      const clean = part.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
      if (clean && vocabList[clean]) {
        span.classList.add('vm-yt-highlighted');
      }

      span.addEventListener('click', e => {
        e.stopPropagation();
        const word = part.replace(/[^a-zA-Z'-]/g, '');
        if (word.length > 1) {
          showPopup(word, e.clientX, e.clientY);
        }
      });

      fragment.appendChild(span);
    });

    segment.textContent = '';
    segment.appendChild(fragment);
  }

  function refreshYouTubeHighlights() {
    document.querySelectorAll('.vm-yt-word').forEach(span => {
      const clean = span.textContent.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
      if (clean && vocabList[clean]) {
        span.classList.add('vm-yt-highlighted');
      } else {
        span.classList.remove('vm-yt-highlighted');
      }
    });
  }

  // ─── Start ────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
