class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private ensureCtx(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.08, slideTo?: number) {
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  public laser() {
    this.playTone(680, 0.09, 'sawtooth', 0.045, 220);
  }

  public hit() {
    this.playTone(160, 0.14, 'square', 0.06, 55);
  }

  public boost() {
    this.playTone(220, 0.18, 'triangle', 0.06, 480);
  }

  public chime() {
    this.playTone(523.25, 0.11, 'sine', 0.07);
    setTimeout(() => this.playTone(659.25, 0.14, 'sine', 0.07), 65);
  }

  public click() {
    this.playTone(420, 0.045, 'triangle', 0.04, 300);
  }

  public gameOver() {
    this.playTone(260, 0.2, 'sawtooth', 0.07, 130);
    setTimeout(() => this.playTone(180, 0.35, 'sawtooth', 0.07, 75), 140);
  }
}

export const soundFx = new SoundEngine();
