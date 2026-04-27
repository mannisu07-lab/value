const input = document.getElementById("text-input");
const button = document.getElementById("add-btn");
const textArea = document.getElementById("text-area");
const sentencesArea = document.createElement("div");
sentencesArea.id = "sentences-area";
textArea.parentNode.insertBefore(sentencesArea, textArea.nextSibling);

// --- Recording (record-as-text) ---
let isRecording = false;
let recordingBuffer = []; // { text: string, time: number }

function startRecording() {
  recordingBuffer = [];
  isRecording = true;
  const btn = document.getElementById('record-btn');
  const replay = document.getElementById('replay-btn');
  if (btn) { btn.textContent = 'Stop Recording'; btn.setAttribute('aria-pressed', 'true'); }
  if (replay) replay.disabled = true;
}

function stopRecording() {
  isRecording = false;
  const btn = document.getElementById('record-btn');
  const replay = document.getElementById('replay-btn');
  if (btn) { btn.textContent = 'Start Recording'; btn.setAttribute('aria-pressed', 'false'); }
  if (replay) replay.disabled = !recordingBuffer.length;
}

function recordUtterance(text) {
  if (!isRecording || !text) return;
  recordingBuffer.push({ text: String(text), time: Date.now() });
  const replay = document.getElementById('replay-btn');
  if (replay) replay.disabled = false;
}

function replayRecording() {
  if (!recordingBuffer || recordingBuffer.length === 0) return;
  // Replay captured texts in order with a small stagger to avoid exact queueing
  recordingBuffer.forEach((item, i) => {
    setTimeout(() => speakNoInterrupt(item.text), i * 400);
  });
}


// 朗读
function speak(text) {
  try { recordUtterance(text); } catch (e) { }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  // read TTS settings from sliders (if present)
  try {
    const volEl = document.getElementById('volume-slider');
    const spEl = document.getElementById('speed-slider');
    const distEl = document.getElementById('dist-slider');
    const vol = volEl ? (volEl.value / 100) : 0.8;
    const rate = spEl ? (spEl.value / 100) : 0.9;
    const dist = distEl ? Number(distEl.value) : 0;
    u.volume = vol;
    u.rate = rate;
    // map distortion (0-100) to pitch range ~1.0-1.8 to simulate vocal coloration
    u.pitch = 1 + (dist / 100) * 0.8;
  } catch (err) {
    u.volume = 0.8;
    u.rate = 0.9;
    u.pitch = 1;
  }
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// Speak without cancelling existing queued/playing utterances (used for multi-read)
function speakNoInterrupt(text, opts = {}) {
  try { recordUtterance(text); } catch (e) { }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts.lang || 'en-US';
  try {
    const volEl = document.getElementById('volume-slider');
    const spEl = document.getElementById('speed-slider');
    const distEl = document.getElementById('dist-slider');
    const vol = volEl ? (volEl.value / 100) : 0.8;
    const rate = spEl ? (spEl.value / 100) : (opts.rate || 0.9);
    const dist = distEl ? Number(distEl.value) : 0;
    u.volume = vol;
    u.rate = rate;
    u.pitch = 1 + (dist / 100) * 0.8;
  } catch (err) {
    u.rate = opts.rate || 0.9;
  }
  speechSynthesis.speak(u);
}

// 添加文本（连续）
// Create a draggable word element for the text area
function createTextWord(word) {
  const span = document.createElement("span");
  span.className = "word";
  span.textContent = word;
  span.draggable = true;
  span.dataset.word = word;

  span.addEventListener("dragstart", e => {
    e.dataTransfer.setData("text/plain", word);
    e.dataTransfer.effectAllowed = "copy";
  });

  return span;
}

// Create a word element inside a sentence block
function createSentenceWord(word) {
  const span = document.createElement("span");
  span.className = "sentence-word";
  span.textContent = word;
  span.draggable = true;
  span.dataset.word = word;

  span.addEventListener("dragstart", e => {
    e.dataTransfer.setData("text/plain", word);
    e.dataTransfer.effectAllowed = "move";
  });

  return span;
}

// Add words (split by whitespace) to the text area as draggable words
function addText() {
  const raw = input.value || "";
  const text = raw.trim();
  if (!text) return;

  const words = text.split(/\s+/);
  words.forEach((w, i) => {
    const ws = createTextWord(w);
    textArea.appendChild(ws);
    // small visual separator
    const sep = document.createTextNode(" ");
    textArea.appendChild(sep);
  });

  input.value = "";
}
// 朗读单词
// Merge nearby sentence blocks when they're within threshold
function tryMergeNearby(target) {
  const MERGE_PX = 48; // threshold
  const sentences = Array.from(document.querySelectorAll('.sentence'));
  if (!target) return;

  sentences.forEach(s => {
    if (s === target) return;
    const r1 = target.getBoundingClientRect();
    const r2 = s.getBoundingClientRect();
    const dx = r1.left + r1.width / 2 - (r2.left + r2.width / 2);
    const dy = r1.top + r1.height / 2 - (r2.top + r2.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist < MERGE_PX) {
      // move all children from s into target
      Array.from(s.children).forEach(ch => target.appendChild(ch));
      s.remove();
    }
  });
}

// Make a sentence element movable by pointer (mouse/touch).
function makeSentenceDraggable(el) {
  if (!el) return;

  // prevent double-attaching
  if (el._movable) return;
  el._movable = true;

  el.style.touchAction = el.style.touchAction || 'none';
  el.style.cursor = el.style.cursor || 'move';

  el.addEventListener('pointerdown', e => {
    // don't start move when interacting with inner words
    if (e.target.closest('.sentence-word')) return;
    e.preventDefault();

    // ensure absolutely positioned and attached to body for free movement
    const rect = el.getBoundingClientRect();
    if (getComputedStyle(el).position !== 'absolute') {
      el.style.position = 'absolute';
      el.style.left = (rect.left + window.scrollX) + 'px';
      el.style.top = (rect.top + window.scrollY) + 'px';
      document.body.appendChild(el);
    }

    const startX = e.pageX;
    const startY = e.pageY;
    const origLeft = parseFloat(el.style.left) || 0;
    const origTop = parseFloat(el.style.top) || 0;

    el.setPointerCapture(e.pointerId);

    function onMove(ev) {
      const dx = ev.pageX - startX;
      const dy = ev.pageY - startY;
      el.style.left = (origLeft + dx) + 'px';
      el.style.top = (origTop + dy) + 'px';
      updateConnectionsFor(el);
    }

    function onUp(ev) {
      try { el.releasePointerCapture(e.pointerId); } catch (err) { }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      // after moving, attempt to merge if nearby
      tryMergeNearby(el);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

// --- Connection infrastructure ---
const connections = []; // {from: Element, to: Element, line: SVGLineElement}

// SVG overlay for drawing connections
const svgNS = 'http://www.w3.org/2000/svg';
const connSvg = document.createElementNS(svgNS, 'svg');
connSvg.classList.add('connection-layer');
connSvg.setAttribute('width', '100%');
connSvg.setAttribute('height', '100%');
document.body.appendChild(connSvg);

function getElCenter(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 + window.scrollX, y: r.top + r.height / 2 + window.scrollY };
}

function renderConnection(conn) {
  if (!conn.line) return;
  const a = getElCenter(conn.from);
  const b = getElCenter(conn.to);
  conn.line.setAttribute('x1', a.x);
  conn.line.setAttribute('y1', a.y);
  conn.line.setAttribute('x2', b.x);
  conn.line.setAttribute('y2', b.y);
}

function updateConnectionsFor(el) {
  connections.forEach(c => {
    if (c.from === el || c.to === el) renderConnection(c);
  });
}

function addConnection(fromEl, toEl) {
  // avoid duplicates
  if (connections.some(c => c.from === fromEl && c.to === toEl)) return null;
  const line = document.createElementNS(svgNS, 'line');
  line.classList.add('connection');
  line.classList.add('connection-line');
  connSvg.appendChild(line);
  const conn = { from: fromEl, to: toEl, line };
  connections.push(conn);
  renderConnection(conn);
  return conn;
}

// Remove connection helper (not used yet)
function removeConnection(conn) {
  const idx = connections.indexOf(conn);
  if (idx !== -1) {
    connSvg.removeChild(conn.line);
    connections.splice(idx, 1);
  }
}

button.addEventListener("click", addText);
input.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    addText();
    e.preventDefault();
  }
});

// Speak on click for words in both areas (delegation)
textArea.addEventListener('click', e => {
  const w = e.target.closest('.word');
  if (w) speak(w.dataset.word || w.textContent);
});

// Global click handler: read sentences or toggle selection anywhere on page
document.addEventListener('click', e => {
  const wordEl = e.target.closest('.sentence-word');
  const sentenceEl = e.target.closest('.sentence');

  if (wordEl && sentenceEl) {
    // select this sentence and read whole sentence (and downstream connections if any)
    Array.from(document.querySelectorAll('.sentence.selected')).forEach(s => s.classList.remove('selected'));
    sentenceEl.classList.add('selected');
    readConnected(sentenceEl);
    return;
  }

  if (sentenceEl) {
    if (e.ctrlKey || e.metaKey) {
      sentenceEl.classList.toggle('selected');
    } else {
      // single-click selects this sentence (clearing others) then read connected chain
      Array.from(document.querySelectorAll('.sentence.selected')).forEach(s => s.classList.remove('selected'));
      sentenceEl.classList.add('selected');
      readConnected(sentenceEl);
    }
    return;
  }
});

// Dragover to allow drops; highlight nearest sentence
sentencesArea.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';

  // highlight nearest sentence under pointer
  const s = e.target.closest('.sentence');
  Array.from(sentencesArea.querySelectorAll('.sentence')).forEach(el => el.classList.remove('drag-over'));
  if (s) s.classList.add('drag-over');
});

sentencesArea.addEventListener('dragleave', e => {
  Array.from(sentencesArea.querySelectorAll('.sentence')).forEach(el => el.classList.remove('drag-over'));
});

// Drop handler: create/append to sentence blocks
sentencesArea.addEventListener('drop', e => {
  e.preventDefault();
  Array.from(sentencesArea.querySelectorAll('.sentence')).forEach(el => el.classList.remove('drag-over'));

  const word = e.dataTransfer.getData('text/plain');
  if (!word) return;

  let targetSentence = e.target.closest('.sentence');
  if (!targetSentence) {
    // create a new absolutely positioned sentence at drop coords
    targetSentence = document.createElement('div');
    targetSentence.className = 'sentence';
    const left = e.pageX;
    const top = e.pageY;
    targetSentence.style.position = 'absolute';
    targetSentence.style.left = left + 'px';
    targetSentence.style.top = top + 'px';
    document.body.appendChild(targetSentence);
    makeSentenceDraggable(targetSentence);
  }

  const sw = createSentenceWord(word);
  targetSentence.appendChild(sw);

  // After drop try merging nearby sentences
  tryMergeNearby(targetSentence);
});

// Allow dropping anywhere on the page to create sentences
document.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

document.addEventListener('drop', e => {
  // ignore drops that originated from dropping into sentencesArea (handled above)
  // and prevent creating duplicate when dropping on an existing .sentence (we handle below)
  e.preventDefault();

  const word = e.dataTransfer.getData('text/plain');
  if (!word) return;

  let targetSentence = e.target.closest('.sentence');
  if (!targetSentence) {
    targetSentence = document.createElement('div');
    targetSentence.className = 'sentence';
    const left = e.pageX;
    const top = e.pageY;
    targetSentence.style.position = 'absolute';
    targetSentence.style.left = left + 'px';
    targetSentence.style.top = top + 'px';
    document.body.appendChild(targetSentence);
    makeSentenceDraggable(targetSentence);
  }

  const sw = createSentenceWord(word);
  targetSentence.appendChild(sw);

  tryMergeNearby(targetSentence);
});

// Double-click on sentence edge to start connector drag
document.addEventListener('dblclick', e => {
  const sentenceEl = e.target.closest('.sentence');
  if (!sentenceEl) return;

  const rect = sentenceEl.getBoundingClientRect();
  const edgeThreshold = 24; // px from right edge
  if (Math.abs(e.clientX - rect.right) > edgeThreshold) return; // only start when double-click near right edge

  // start interactive connector
  let start = getElCenter(sentenceEl);
  const tempLine = document.createElementNS(svgNS, 'line');
  tempLine.classList.add('temp');
  tempLine.setAttribute('x1', start.x);
  tempLine.setAttribute('y1', start.y);
  tempLine.setAttribute('x2', start.x);
  tempLine.setAttribute('y2', start.y);
  connSvg.appendChild(tempLine);

  function onMove(ev) {
    tempLine.setAttribute('x2', ev.pageX + window.scrollX);
    tempLine.setAttribute('y2', ev.pageY + window.scrollY);
  }

  function onUp(ev) {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    connSvg.removeChild(tempLine);

    const dropEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.sentence');
    if (dropEl && dropEl !== sentenceEl) {
      addConnection(sentenceEl, dropEl);
    }
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
});

// Allow creating an empty sentence by clicking empty area
sentencesArea.addEventListener('dblclick', e => {
  if (e.target === sentencesArea) {
    const s = document.createElement('div');
    s.className = 'sentence';
    // place it at center of sentencesArea
    const rect = sentencesArea.getBoundingClientRect();
    s.style.position = 'absolute';
    s.style.left = (rect.left + rect.width / 2 + window.scrollX) + 'px';
    s.style.top = (rect.top + rect.height / 2 + window.scrollY) + 'px';
    document.body.appendChild(s);
    makeSentenceDraggable(s);
  }
});

// Read selected or all sentences controls
const readSelectedBtn = document.getElementById('read-selected-btn');
const readAllBtn = document.getElementById('read-all-btn');

function readSentences(sentEls, { interrupt = false } = {}) {
  if (!sentEls || sentEls.length === 0) return;

  // For single sentence read use interrupt (default speak cancels). For multi, do not cancel.
  if (interrupt && sentEls.length === 1) {
    const txt = Array.from(sentEls[0].querySelectorAll('.sentence-word')).map(s => s.textContent).join(' ');
    speak(txt);
    return;
  }

  // Attempt to speak all sentences; browsers may queue instead of truly overlapping.
  sentEls.forEach((sEl, i) => {
    const txt = Array.from(sEl.querySelectorAll('.sentence-word')).map(w => w.textContent).join(' ');
    // small stagger to reduce exact simultaneous queueing
    setTimeout(() => speakNoInterrupt(txt), i * 20);
  });
}

readSelectedBtn.addEventListener('click', () => {
  const selected = Array.from(document.querySelectorAll('.sentence.selected'));
  readSentences(selected, { interrupt: false });
});

readAllBtn.addEventListener('click', () => {
  const all = Array.from(document.querySelectorAll('.sentence'));
  readSentences(all, { interrupt: false });
});

// Read a sentence and all downstream connected sentences (preorder DFS)
function readConnected(startEl) {
  const order = [];
  const seen = new Set();

  function dfs(el) {
    if (!el || seen.has(el)) return;
    seen.add(el);
    order.push(el);
    // find outgoing connections
    connections.forEach(c => {
      if (c.from === el) dfs(c.to);
    });
  }

  dfs(startEl);
  readSentences(order, { interrupt: false });
}

// Double-click on page to create an empty sentence at that position (unless clicking inside input or existing sentence)
document.addEventListener('dblclick', e => {
  if (e.target.closest('.sentence')) return;
  if (e.target.closest('#input-bar')) return;
  if (e.target.closest('#text-area')) return;

  const s = document.createElement('div');
  s.className = 'sentence';
  s.style.position = 'absolute';
  s.style.left = e.pageX + 'px';
  s.style.top = e.pageY + 'px';
  document.body.appendChild(s);
  makeSentenceDraggable(s);
});

// Toggle visibility of input bar and text area when pressing 'A'
function toggleUIVisibility() {
  document.body.classList.toggle('ui-hidden');
}

document.addEventListener('keydown', e => {
  // ignore when typing in inputs or editable areas
  const active = document.activeElement;
  const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
  if (inInput) return;

  if (e.key && e.key.toLowerCase() === 'a') {
    toggleUIVisibility();
  }

  // Delete selected sentences with Delete or Backspace
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const selected = Array.from(document.querySelectorAll('.sentence.selected'));
    if (selected.length === 0) return;

    selected.forEach(el => {
      // remove connections that involve this element
      connections.slice().forEach(c => {
        if (c.from === el || c.to === el) removeConnection(c);
      });
      el.remove();
    });
  }
});

// --- Background image swipe / keyboard navigation ---
// Adds a fixed background layer and allows swiping to change images stored in /images/
const bgLayer = document.createElement('div');
bgLayer.id = 'bg-image-layer';
document.body.appendChild(bgLayer);

let BG_LIST = window.BG_IMAGES || [];
let bgIndex = 0;

async function tryLoadDirectoryListing() {
  try {
    const res = await fetch('/images/');
    if (!res.ok) return [];
    const txt = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(txt, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('a'));
    const hrefs = anchors.map(a => a.getAttribute('href')).filter(Boolean);
    const exts = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'];
    const files = hrefs.filter(h => {
      const L = h.toLowerCase();
      return exts.some(x => L.endsWith(x));
    });
    return files.map(s => (s.startsWith('/') ? s : ('/images/' + s))).map(p => p.replace(/\\/g, '/'));
  } catch (err) {
    return [];
  }
}

function setBgAtIndex(i) {
  if (!BG_LIST || BG_LIST.length === 0) return;
  bgIndex = (i + BG_LIST.length) % BG_LIST.length;
  const url = BG_LIST[bgIndex];
  const safeUrl = encodeURI(String(url));
  // If it's a video (mp4/webm), render a <video> element inside the bg layer
  const lower = String(url).toLowerCase();
  const isVideo = lower.endsWith('.mp4') || lower.endsWith('.webm');

  // remove any existing video element when switching
  const existingVideo = bgLayer.querySelector('video');
  if (existingVideo) {
    try { existingVideo.pause(); } catch (e) { }
    try { existingVideo.removeAttribute('src'); } catch (e) { }
    try { existingVideo.load && existingVideo.load(); } catch (e) { }
    try { existingVideo.remove(); } catch (e) { }
  }

  if (isVideo) {
    bgLayer.style.backgroundImage = 'none';
    const v = document.createElement('video');
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    v.setAttribute('loop', '');
    v.autoplay = true;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.src = safeUrl;
    v.style.objectFit = 'cover';
    bgLayer.appendChild(v);
    // attempt to play (muted autoplay is typically allowed); catch and log any failure
    v.play().catch(err => {
      console.warn('Background video play prevented or failed:', err);
    });
    v.addEventListener('canplay', () => {
      // try again when ready
      v.play().catch(() => { });
    });
  } else {
    const img = new Image();
    img.onload = () => {
      bgLayer.style.backgroundImage = `url('${url}')`;
    };
    img.onerror = () => { };
    img.src = url;
  }
}

function nextBg() { if (BG_LIST.length) setBgAtIndex(bgIndex + 1); }
function prevBg() { if (BG_LIST.length) setBgAtIndex(bgIndex - 1); }

(async function initBgList() {
  const list = await tryLoadDirectoryListing();
  if (list && list.length) BG_LIST = list;
  if ((!BG_LIST || BG_LIST.length === 0) && window.BG_IMAGES && window.BG_IMAGES.length) {
    BG_LIST = window.BG_IMAGES.map(p => p.startsWith('/') ? p : ('/images/' + p));
  }
  if (BG_LIST && BG_LIST.length) setBgAtIndex(0);
})();

// --- Recording UI wiring ---
(function () {
  const recordBtn = document.getElementById('record-btn');
  const replayBtn = document.getElementById('replay-btn');

  if (replayBtn) replayBtn.disabled = !(recordingBuffer && recordingBuffer.length);

  if (recordBtn) {
    recordBtn.addEventListener('click', () => {
      if (!isRecording) startRecording(); else stopRecording();
    });
  }

  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      replayRecording();
    });
  }
})();


// touch swipe detection
let touchStartX = 0, touchStartY = 0, touchMoved = false;
document.addEventListener('touchstart', e => {
  if (!e.touches || e.touches.length === 0) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchMoved = false;
});

document.addEventListener('touchmove', e => { touchMoved = true; });

document.addEventListener('touchend', e => {
  if (!touchMoved) return;
  const last = e.changedTouches && e.changedTouches[0];
  if (!last) return;
  const dx = last.clientX - touchStartX;
  const dy = last.clientY - touchStartY;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    if (dx < 0) nextBg(); else prevBg();
  }
});

// keyboard arrows
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') prevBg();
  if (e.key === 'ArrowRight') nextBg();
});

// Wire sliders to control the reader (TTS) parameters; keep soundtrack play button behavior
(function () {
  const audioBtn = document.getElementById('play-audio');
  const bgAudio = document.getElementById('bg-audio');
  const volSlider = document.getElementById('volume-slider');
  const volVal = document.getElementById('volume-val');
  const speedSlider = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  const distSlider = document.getElementById('dist-slider');
  const distVal = document.getElementById('dist-val');

  // read/update TTS settings
  function updateVolumeFromSlider() {
    const v = (volSlider ? volSlider.value : 80) / 100;
    if (volVal) volVal.textContent = v.toFixed(2);
  }
  function updateSpeedFromSlider() {
    const rate = (speedSlider ? speedSlider.value : 100) / 100;
    if (speedVal) speedVal.textContent = rate.toFixed(2) + 'x';
  }
  function updateDistortionFromSlider() {
    const d = distSlider ? Number(distSlider.value) : 0;
    if (distVal) distVal.textContent = d.toFixed(0);
  }

  if (volSlider) volSlider.addEventListener('input', updateVolumeFromSlider);
  if (speedSlider) speedSlider.addEventListener('input', updateSpeedFromSlider);
  if (distSlider) distSlider.addEventListener('input', updateDistortionFromSlider);

  updateVolumeFromSlider();
  updateSpeedFromSlider();
  updateDistortionFromSlider();

  if (audioBtn && bgAudio) {
    bgAudio.loop = true;
    audioBtn.addEventListener('click', () => {
      if (bgAudio.paused) {
        bgAudio.play().then(() => {
          audioBtn.textContent = 'Pause Soundtrack';
          audioBtn.setAttribute('aria-pressed', 'true');
        }).catch(err => {
          console.warn('Audio play prevented:', err);
        });
      } else {
        bgAudio.pause();
        audioBtn.textContent = 'Play Soundtrack';
        audioBtn.setAttribute('aria-pressed', 'false');
      }
    });
    bgAudio.addEventListener('play', () => audioBtn.setAttribute('aria-pressed', 'true'));
    bgAudio.addEventListener('pause', () => audioBtn.setAttribute('aria-pressed', 'false'));
  }
})();