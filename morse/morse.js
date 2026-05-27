// Morse code data + dichotomic tree + timing classifier

// Letter and digit codes (depth 1-5, but only depths 1-4 appear on the visual tree)
const RAW = {
    E: '.',
    T: '-',
    I: '..', A: '.-', N: '-.', M: '--',
    S: '...', U: '..-', R: '.-.', W: '.--',
    D: '-..', K: '-.-', G: '--.', O: '---',
    H: '....', V: '...-',
    F: '..-.',
    L: '.-..',
    P: '.--.', J: '.---',
    B: '-...', X: '-..-',
    C: '-.-.', Y: '-.--',
    Z: '--..', Q: '--.-',
    '0': '-----',
    '1': '.----',
    '2': '..---',
    '3': '...--',
    '4': '....-',
    '5': '.....',
    '6': '-....',
    '7': '--...',
    '8': '---..',
    '9': '----.'
};

export const CODE_TO_CHAR = {};
for (const [ch, code] of Object.entries(RAW)) {
    CODE_TO_CHAR[code] = ch;
}

export const CHAR_TO_CODE = { ...RAW };

// Build the dichotomic tree. Convention: dot child branches RIGHT (positive col
// offset), dash child branches LEFT (negative col offset). Offset at depth d
// halves with each step so children of a node sit symmetrically beneath it.
const MAX_DEPTH = 4;

function buildTree() {
    const nodes = [];
    nodes.push({
        char: null,
        code: '',
        depth: 0,
        side: 'root',
        offset: 0,
        parentOffset: null
    });

    const initialStep = Math.pow(2, MAX_DEPTH - 1); // 8 for depth=4

    function descend(depth, parentCode, parentOffset, step) {
        if (depth > MAX_DEPTH) return;
        const dotCode = parentCode + '.';
        const dashCode = parentCode + '-';
        const dotOffset = parentOffset + step;
        const dashOffset = parentOffset - step;

        nodes.push({
            char: CODE_TO_CHAR[dotCode] || null,
            code: dotCode,
            depth,
            side: 'dot',
            offset: dotOffset,
            parentOffset
        });
        nodes.push({
            char: CODE_TO_CHAR[dashCode] || null,
            code: dashCode,
            depth,
            side: 'dash',
            offset: dashOffset,
            parentOffset
        });

        descend(depth + 1, dotCode, dotOffset, step / 2);
        descend(depth + 1, dashCode, dashOffset, step / 2);
    }

    descend(1, '', 0, initialStep);
    return nodes;
}

// Total grid columns and the column the root antenna sits on.
// Offsets range from -15 to +15, so 31 columns and root at column 16.
export const TOTAL_COLS = 31;
export const ROOT_COL = 16;

const RAW_TREE = buildTree();

// Expose tree with a 1-based CSS grid column already computed.
export const TREE = RAW_TREE.map(n => ({
    ...n,
    col: n.offset + ROOT_COL
}));

/**
 * Press / release timing classifier.
 *
 * Events:
 *   - 'symbol':       payload '.' | '-'
 *   - 'letter':       payload { char: 'A' | null, code: '.-' }
 *   - 'word':         payload undefined (a word gap elapsed)
 *   - 'bufferChange': payload current code string (e.g. '.-')
 */
export class MorseClassifier {
    constructor({ wpm = 10 } = {}) {
        this.listeners = Object.create(null);
        this.buffer = '';
        this._pressStart = 0;
        this._letterTimer = null;
        this._wordTimer = null;
        this.setWpm(wpm);
    }

    setWpm(wpm) {
        this.wpm = wpm;
        this.ditMs = 1200 / wpm;
        this.pressThreshold = 2 * this.ditMs;
        this.letterGap = 2 * this.ditMs;
        this.wordGap = 5 * this.ditMs;
    }

    on(event, cb) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(cb);
        return () => {
            this.listeners[event] = this.listeners[event].filter(fn => fn !== cb);
        };
    }

    _emit(event, payload) {
        const subs = this.listeners[event];
        if (!subs) return;
        for (const fn of subs) fn(payload);
    }

    press() {
        this._pressStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (this._letterTimer) {
            clearTimeout(this._letterTimer);
            this._letterTimer = null;
        }
        if (this._wordTimer) {
            clearTimeout(this._wordTimer);
            this._wordTimer = null;
        }
    }

    release() {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const dur = now - this._pressStart;
        const symbol = dur < this.pressThreshold ? '.' : '-';
        this.buffer += symbol;
        this._emit('symbol', symbol);
        this._emit('bufferChange', this.buffer);
        this._scheduleLetter();
    }

    _scheduleLetter() {
        if (this._letterTimer) clearTimeout(this._letterTimer);
        this._letterTimer = setTimeout(() => this._commitLetter(), this.letterGap);
    }

    _commitLetter() {
        this._letterTimer = null;
        if (this.buffer.length === 0) return;
        const code = this.buffer;
        const char = CODE_TO_CHAR[code] || null;
        this.buffer = '';
        this._emit('letter', { char, code });
        this._emit('bufferChange', this.buffer);
        // After a letter commits, additional silence at least (wordGap - letterGap) signals a word break.
        if (this._wordTimer) clearTimeout(this._wordTimer);
        this._wordTimer = setTimeout(() => {
            this._wordTimer = null;
            this._emit('word');
        }, Math.max(0, this.wordGap - this.letterGap));
    }

    clear() {
        this.buffer = '';
        if (this._letterTimer) {
            clearTimeout(this._letterTimer);
            this._letterTimer = null;
        }
        if (this._wordTimer) {
            clearTimeout(this._wordTimer);
            this._wordTimer = null;
        }
        this._emit('bufferChange', this.buffer);
    }
}
