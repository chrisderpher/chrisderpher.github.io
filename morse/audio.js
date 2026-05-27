// Lightweight Web Audio buzzer for Morse keying.
// Creates a single AudioContext + persistent oscillator + gain envelope so
// press() / release() just ramp the gain to avoid clicks.

export class MorseAudio {
    constructor({ frequency = 600, volume = 0.2 } = {}) {
        this.frequency = frequency;
        this.volume = volume;
        this.muted = false;
        this.ctx = null;
        this.oscillator = null;
        this.gain = null;
    }

    _ensureCtx() {
        if (this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.oscillator = this.ctx.createOscillator();
        this.gain = this.ctx.createGain();
        this.oscillator.type = 'sine';
        this.oscillator.frequency.value = this.frequency;
        this.gain.gain.value = 0;
        this.oscillator.connect(this.gain);
        this.gain.connect(this.ctx.destination);
        try {
            this.oscillator.start();
        } catch (e) {
            // Already started; ignore.
        }
    }

    press() {
        if (this.muted) return;
        this._ensureCtx();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const now = this.ctx.currentTime;
        const g = this.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(this.volume, now + 0.005); // 5ms attack
    }

    release() {
        if (!this.ctx || !this.gain) return;
        const now = this.ctx.currentTime;
        const g = this.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + 0.010); // 10ms release
    }

    setMuted(muted) {
        this.muted = !!muted;
        if (this.muted) this.release();
    }
}
