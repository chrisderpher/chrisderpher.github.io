import { TREE, TOTAL_COLS, CODE_TO_CHAR, MorseClassifier } from './morse.js';
import { MorseAudio } from './audio.js';
import UIManager, { UI_STATE } from './ui.js';

// ===== Module state =====
const ui = new UIManager();
const classifier = new MorseClassifier({ wpm: 10 });
const audio = new MorseAudio();
let audioEnabled = true;
let keyHeld = false;
const treeNodeByCode = new Map(); // code string -> node element
let antennaEl = null;              // depth-0 root node (built into the tree)
let tracesSvg = null;              // svg overlay containing the path elements
const tracePathByCode = new Map(); // code string -> svg path element (path FROM parent TO this node)
let resizeRafId = null;

// Press-duration timer: flips the KEY button orange the moment the press
// duration crosses the same threshold the classifier uses to decide dot/dash.
let dashThresholdTimer = null;

// Streak mode state. `streakBest` is the only piece that persists.
let streakActive = false;
let streakCurrent = 0;
let streakBest = loadStreakBest();
let streakTarget = '';
const STREAK_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function loadStreakBest() {
    try {
        const raw = localStorage.getItem('morse.streakBest');
        const n = parseInt(raw || '0', 10);
        return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (_) {
        return 0;
    }
}

function saveStreakBest() {
    try {
        localStorage.setItem('morse.streakBest', String(streakBest));
    } catch (_) {
        // localStorage unavailable (private mode, quota, etc.) - silently skip.
    }
}

// ===== DOM =====
const startScreen = document.getElementById('start-screen');
const trainerScreen = document.getElementById('trainer-screen');
const helpScreen = document.getElementById('help-screen');
const startTap = document.getElementById('start-tap');
const helpClose = document.getElementById('help-close');
const treeEl = document.getElementById('tree');
const streamEl = document.getElementById('stream');
const decodedEl = document.getElementById('decoded');
const keyButton = document.getElementById('key-button');
const wpmSlider = document.getElementById('wpm-slider');
const wpmLabel = document.getElementById('wpm-label');
const audioToggle = document.getElementById('audio-toggle');
const clearBtn = document.getElementById('clear-btn');
const helpBtn = document.getElementById('help-btn');
const streakToggle = document.getElementById('streak-toggle');
const streakBanner = document.getElementById('streak-banner');
const streakLetterEl = document.getElementById('streak-letter');
const streakCurrentEl = document.getElementById('streak-current');
const streakBestEl = document.getElementById('streak-best');

const SVG_NS = 'http://www.w3.org/2000/svg';

// ===== Build tree =====
function buildTreeDom() {
    treeEl.style.gridTemplateColumns = `repeat(${TOTAL_COLS}, 1fr)`;
    const frag = document.createDocumentFragment();

    // Depth-0 antenna sits at the top center; the visible chain root.
    const antenna = document.createElement('div');
    antenna.className = 'tree-node tree-antenna';
    antenna.dataset.depth = '0';
    antenna.dataset.side = 'root';
    antenna.dataset.code = '';
    antenna.style.gridColumn = `${TREE[0].col} / span 1`;
    antenna.style.gridRow = '1';
    const antShape = document.createElement('span');
    antShape.className = 'antenna-glyph';
    antShape.textContent = '\u25B2'; // up-triangle (antenna emitter)
    antenna.appendChild(antShape);
    antennaEl = antenna;
    frag.appendChild(antenna);

    for (const node of TREE) {
        if (node.depth === 0) continue;            // already rendered above
        if (!node.char) continue;                  // depth-4 slots without a letter

        const el = document.createElement('div');
        el.className = 'tree-node';
        el.dataset.depth = String(node.depth);
        el.dataset.side = node.side;
        el.dataset.code = node.code;
        el.dataset.col = String(node.col);
        el.style.gridColumn = `${node.col} / span 1`;
        el.style.gridRow = String(node.depth + 1); // shift down by 1 to make room for the antenna row

        const shape = document.createElement('span');
        shape.className = `node-shape ${node.side === 'dot' ? 'dot' : 'dash'}`;
        el.appendChild(shape);

        const letter = document.createElement('span');
        letter.className = 'node-letter';
        letter.textContent = node.char;
        el.appendChild(letter);

        treeNodeByCode.set(node.code, el);
        frag.appendChild(el);
    }

    treeEl.appendChild(frag);
}

// ===== SVG traces (real lines connecting each child to its parent) =====
function ensureTracesSvg() {
    if (tracesSvg && tracesSvg.parentNode === treeEl) return tracesSvg;
    tracesSvg = document.createElementNS(SVG_NS, 'svg');
    tracesSvg.classList.add('tree-traces');
    tracesSvg.setAttribute('preserveAspectRatio', 'none');
    treeEl.insertBefore(tracesSvg, treeEl.firstChild);
    return tracesSvg;
}

function drawTreeTraces() {
    const svg = ensureTracesSvg();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    tracePathByCode.clear();

    const treeRect = treeEl.getBoundingClientRect();
    if (treeRect.width === 0 || treeRect.height === 0) return;

    svg.setAttribute('viewBox', `0 0 ${treeRect.width} ${treeRect.height}`);
    svg.style.width = treeRect.width + 'px';
    svg.style.height = treeRect.height + 'px';

    for (const [code, childEl] of treeNodeByCode) {
        const parentCode = code.slice(0, -1);
        const parentEl = parentCode === '' ? antennaEl : treeNodeByCode.get(parentCode);
        if (!parentEl) continue;

        const c = childEl.getBoundingClientRect();
        const p = parentEl.getBoundingClientRect();
        const cx = c.left + c.width / 2 - treeRect.left;
        const ct = c.top - treeRect.top;
        const px = p.left + p.width / 2 - treeRect.left;
        const pb = p.bottom - treeRect.top;
        const midY = pb + (ct - pb) * 0.55;

        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', `M ${cx} ${ct} L ${cx} ${midY} L ${px} ${midY} L ${px} ${pb}`);
        path.setAttribute('class', 'trace');
        path.dataset.code = code;
        svg.appendChild(path);
        tracePathByCode.set(code, path);
    }

    // Re-apply lit chain in case a buffer is active across resize.
    refreshLitChain();
}

function scheduleRedrawTraces() {
    if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
    resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null;
        drawTreeTraces();
    });
}

// ===== Stream and decoded helpers =====
function appendStreamSymbol(sym) {
    const span = document.createElement('span');
    span.className = sym === '.' ? 'dot' : 'dash';
    streamEl.appendChild(span);
    streamEl.scrollLeft = streamEl.scrollWidth;
}

function appendStreamGap() {
    const span = document.createElement('span');
    span.className = 'gap';
    streamEl.appendChild(span);
    streamEl.scrollLeft = streamEl.scrollWidth;
}

function appendDecoded(char) {
    decodedEl.textContent += char;
}

function clearAll() {
    streamEl.innerHTML = '';
    decodedEl.textContent = '';
    classifier.clear();
    clearLitNode();
}

let litCode = '';
function clearLitNode() {
    refreshLitChain('');
}

function lightNodeForBuffer(code) {
    refreshLitChain(code);
}

// Highlight every node and every connecting trace along the path
// from the antenna root down to the in-progress code. This mirrors
// the moving-LED behavior of the physical Morse Code Gadget card.
function refreshLitChain(nextCode) {
    if (typeof nextCode === 'string') litCode = nextCode;

    for (const el of treeNodeByCode.values()) el.classList.remove('lit', 'on-path');
    for (const path of tracePathByCode.values()) path.classList.remove('lit-trace');
    if (antennaEl) antennaEl.classList.toggle('on-path', litCode.length > 0 || keyHeld);

    if (!litCode) return;

    for (let i = 1; i <= litCode.length; i++) {
        const partial = litCode.slice(0, i);
        const node = treeNodeByCode.get(partial);
        const path = tracePathByCode.get(partial);
        if (node) {
            node.classList.add('on-path');
            if (i === litCode.length) node.classList.add('lit');
        }
        if (path) path.classList.add('lit-trace');
    }
}

// ===== Classifier wiring =====
classifier.on('symbol', sym => {
    appendStreamSymbol(sym);
});

classifier.on('bufferChange', code => {
    lightNodeForBuffer(code);
});

classifier.on('letter', ({ char, code }) => {
    appendStreamGap();
    appendDecoded(char || '?');
    clearLitNode();
    if (streakActive) handleStreakAttempt(char);
});

classifier.on('word', () => {
    if (decodedEl.textContent.length === 0) return;
    if (decodedEl.textContent.endsWith(' ')) return;
    appendDecoded(' ');
    appendStreamGap();
    appendStreamGap();
});

// ===== Key handling =====
function onPress() {
    if (keyHeld) return;
    keyHeld = true;
    keyButton.classList.add('pressed');
    keyButton.classList.remove('dash');
    if (antennaEl) antennaEl.classList.add('active');
    classifier.press();
    if (audioEnabled) audio.press();

    // Flip green -> orange the moment the press crosses the classifier's
    // dot/dash threshold. Cancelled in onRelease, so a quick tap never fires.
    if (dashThresholdTimer) clearTimeout(dashThresholdTimer);
    dashThresholdTimer = setTimeout(() => {
        if (keyHeld) keyButton.classList.add('dash');
    }, classifier.pressThreshold);
}

function onRelease() {
    if (!keyHeld) return;
    keyHeld = false;
    if (dashThresholdTimer) {
        clearTimeout(dashThresholdTimer);
        dashThresholdTimer = null;
    }
    keyButton.classList.remove('pressed', 'dash');
    if (antennaEl) antennaEl.classList.remove('active');
    classifier.release();
    audio.release();
}

function bindKey(element) {
    // Mouse
    element.addEventListener('mousedown', e => {
        e.preventDefault();
        onPress();
    });
    element.addEventListener('mouseup', e => {
        e.preventDefault();
        onRelease();
    });
    element.addEventListener('mouseleave', () => {
        if (keyHeld) onRelease();
    });

    // Touch
    element.addEventListener('touchstart', e => {
        e.preventDefault();
        onPress();
    }, { passive: false });
    element.addEventListener('touchend', e => {
        e.preventDefault();
        onRelease();
    }, { passive: false });
    element.addEventListener('touchcancel', e => {
        e.preventDefault();
        onRelease();
    }, { passive: false });
}

// Document-level keyboard
document.addEventListener('keydown', e => {
    const state = ui.getState();

    if (state === UI_STATE.START) {
        if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault();
            enterTrainer();
        }
        return;
    }

    if (state === UI_STATE.TRAINER) {
        if (e.code === 'Space' || e.key === ' ') {
            if (e.repeat) return;
            e.preventDefault();
            onPress();
            return;
        }
        if (e.key === '?') {
            e.preventDefault();
            openHelp();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            clearAll();
            return;
        }
        return;
    }

    if (state === UI_STATE.HELP) {
        if (e.key === '?' || e.key === 'Escape') {
            e.preventDefault();
            closeHelp();
        }
        return;
    }
});

document.addEventListener('keyup', e => {
    if (ui.getState() === UI_STATE.TRAINER && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        onRelease();
    }
});

// Release if focus is lost while key is held.
window.addEventListener('blur', () => {
    if (keyHeld) onRelease();
});

// ===== Screen transitions =====
function showScreen(name) {
    startScreen.classList.add('hidden');
    trainerScreen.classList.add('hidden');
    helpScreen.classList.add('hidden');
    if (name === 'start') startScreen.classList.remove('hidden');
    else if (name === 'trainer') trainerScreen.classList.remove('hidden');
    else if (name === 'help') {
        // Help is an overlay; keep trainer behind it.
        trainerScreen.classList.remove('hidden');
        helpScreen.classList.remove('hidden');
    }
}

function enterTrainer() {
    ui.setState(UI_STATE.TRAINER);
    showScreen('trainer');
}

function openHelp() {
    if (keyHeld) onRelease();
    ui.setState(UI_STATE.HELP);
    showScreen('help');
}

function closeHelp() {
    ui.setState(UI_STATE.TRAINER);
    showScreen('trainer');
}

// ===== Controls =====
function updateAudioToggleLabel() {
    audioToggle.textContent = audioEnabled ? 'Audio: ON' : 'Audio: OFF';
    audioToggle.classList.toggle('muted', !audioEnabled);
}

function setWpm(wpm) {
    classifier.setWpm(wpm);
    wpmLabel.textContent = String(wpm);
}

// ===== Streak mode =====
function pickNextTarget() {
    // Avoid repeating the previous target. On first pick (`streakTarget` empty)
    // any letter is fair game.
    let next;
    do {
        next = STREAK_POOL[Math.floor(Math.random() * STREAK_POOL.length)];
    } while (next === streakTarget);
    streakTarget = next;
}

function updateStreakDom() {
    streakLetterEl.textContent = streakTarget || '-';
    streakCurrentEl.textContent = String(streakCurrent);
    streakBestEl.textContent = String(streakBest);
}

function handleStreakAttempt(char) {
    // `char` is null/undefined for unknown codes. Treat anything that isn't
    // the target letter as a miss (resets current, keeps the same target).
    if (char && char === streakTarget) {
        streakCurrent += 1;
        if (streakCurrent > streakBest) {
            streakBest = streakCurrent;
            saveStreakBest();
        }
        pickNextTarget();
    } else {
        streakCurrent = 0;
    }
    updateStreakDom();
}

function setStreakActive(active) {
    streakActive = active;
    if (active) {
        if (!streakTarget) pickNextTarget();
        streakBanner.classList.remove('hidden');
        streakToggle.classList.add('streak-on');
        streakToggle.textContent = 'Streak: ON';
    } else {
        streakCurrent = 0;
        streakBanner.classList.add('hidden');
        streakToggle.classList.remove('streak-on');
        streakToggle.textContent = 'Streak: OFF';
    }
    updateStreakDom();
}

// ===== Init =====
function init() {
    buildTreeDom();
    bindKey(keyButton);

    startTap.addEventListener('click', () => enterTrainer());
    helpClose.addEventListener('click', () => closeHelp());

    wpmSlider.addEventListener('input', () => {
        const v = parseInt(wpmSlider.value, 10);
        if (!Number.isNaN(v)) setWpm(v);
    });

    audioToggle.addEventListener('click', () => {
        audioEnabled = !audioEnabled;
        audio.setMuted(!audioEnabled);
        updateAudioToggleLabel();
    });

    clearBtn.addEventListener('click', () => clearAll());
    helpBtn.addEventListener('click', () => openHelp());
    streakToggle.addEventListener('click', () => setStreakActive(!streakActive));

    setWpm(parseInt(wpmSlider.value, 10) || 10);
    updateAudioToggleLabel();
    updateStreakDom();
    showScreen('start');

    // The tree DOM needs to be in layout before we can measure positions.
    // Draw once after the first paint, and again whenever the viewport changes.
    requestAnimationFrame(() => requestAnimationFrame(drawTreeTraces));
    window.addEventListener('resize', scheduleRedrawTraces);

    // Also redraw when the trainer screen first becomes visible, in case it
    // was hidden (display:none yields zero-sized rects) during the initial draw.
    const observer = new MutationObserver(() => {
        if (!trainerScreen.classList.contains('hidden')) scheduleRedrawTraces();
    });
    observer.observe(trainerScreen, { attributes: true, attributeFilter: ['class'] });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
