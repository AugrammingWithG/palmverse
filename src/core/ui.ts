import type { SceneDef } from '../scenes/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** "Palm Terr{a}rium" → "Palm Terr<em>a</em>rium": one letter set in italic serif. */
export function mixedType(text: string): string {
  return text.replace(/\{(.+?)\}/g, '<em>$1</em>');
}

const SPARKLE =
  '<svg class="sparkle" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0c.8 7.2 4.8 11.2 12 12-7.2.8-11.2 4.8-12 12-.8-7.2-4.8-11.2-12-12 7.2-.8 11.2-4.8 12-12z"/></svg>';

const IDLE_AFTER = 3500;
const CAPTION_MS = 7000;
const PROMPT_DELAY = 2500;

/** DOM chrome: landing, world dock, gesture captions, help drawer, toast, recording mode and 9:16 guide. */
export class UI {
  readonly startCameraBtn = $<HTMLButtonElement>('start-camera');
  readonly startMouseBtn = $<HTMLButtonElement>('start-mouse');
  /** Called by the help drawer's camera ↔ mouse button. */
  onToggleSource: (() => void) | null = null;
  recording = false;

  private loader = $('loader');
  private loaderMsg = $('loader-msg');
  private dock = $('dock');
  private caption = $('caption');
  private prompt = $('prompt');
  private fps = $('fps');
  private source = $('source');
  private hands = $('hands');
  private help = $('help');
  private helpBtn = $<HTMLButtonElement>('help-btn');
  private frameBtn = $<HTMLButtonElement>('frame-btn');
  private sourceBtn = $<HTMLButtonElement>('source-btn');
  private helpWorld = $('help-world');
  private toastEl = $('toast');
  private frameGuide = $('frame-guide');
  private buttons = new Map<string, HTMLButtonElement>();
  private active: SceneDef | null = null;
  private toastTimer = 0;
  private captionTimer = 0;
  private idleTimer = 0;
  private handsGoneSince = 0;

  constructor(scenes: SceneDef[], onSelect: (def: SceneDef) => void) {
    for (const def of scenes) {
      const btn = document.createElement('button');
      btn.className = 'dock__item';
      if (def.id === 'hand-lab') btn.classList.add('dock__item--lab');
      btn.innerHTML =
        `<kbd>${def.key}</kbd><span class="dock__short">${def.short}</span>` +
        `<span class="dock__name">${mixedType(def.display)}</span>`;
      btn.title = `${def.title} (${def.key})`;
      btn.setAttribute('aria-label', def.title);
      btn.addEventListener('click', () => onSelect(def));
      this.dock.appendChild(btn);
      this.buttons.set(def.id, btn);
    }

    this.helpBtn.addEventListener('click', () => this.toggleHelp());
    $('help-close').addEventListener('click', () => this.toggleHelp(false));
    $('rec-btn').addEventListener('click', () => this.toggleRecording());
    this.frameBtn.addEventListener('click', () => this.toggleFrameGuide());
    this.sourceBtn.addEventListener('click', () => this.onToggleSource?.());
    window.addEventListener('dblclick', () => this.recording && this.toggleRecording());

    const wake = () => this.wake();
    for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel']) window.addEventListener(type, wake, { passive: true });
    this.wake();
  }

  get onLanding(): boolean {
    return document.body.classList.contains('landing');
  }

  setActiveScene(def: SceneDef): void {
    const known = this.buttons.has(def.id);
    for (const [id, btn] of this.buttons) btn.setAttribute('aria-current', String(id === def.id));
    if (!known) return;
    this.active = def;
    this.renderHelpWorld();
    this.showCaption(def);
  }

  private showCaption(def: SceneDef): void {
    const items = def.gestures.map(([gesture, effect]) => `<li><em>${gesture}</em> <span>${effect}</span></li>`);
    this.caption.innerHTML = `<ul>${items.join(`<li class="caption__sep" aria-hidden="true">${SPARKLE}</li>`)}</ul>`;
    this.caption.classList.remove('show');
    void this.caption.offsetWidth; // restart the entrance
    this.caption.classList.add('show');
    clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => this.caption.classList.remove('show'), CAPTION_MS);
  }

  private renderHelpWorld(): void {
    const def = this.active;
    if (!def) return;
    const rows = def.gestures.map(([g, e]) => `<dt>${g}</dt><dd>${e}</dd>`).join('');
    this.helpWorld.innerHTML = `<h3>${mixedType(def.display)}</h3><dl class="gestures">${rows}</dl>`;
  }

  setStats(fps: number, inferenceMs: number | null): void {
    this.fps.textContent = inferenceMs === null ? `${fps} fps` : `${fps} fps · ${inferenceMs.toFixed(0)} ms`;
  }

  setSource(source: 'camera' | 'mouse', detail: string): void {
    this.source.textContent = detail;
    this.sourceBtn.textContent = source === 'camera' ? 'Use the mouse hand instead' : 'Use the camera instead';
    document.body.dataset.source = source;
  }

  /** Debug readouts (fps, inference, source, hands) only while the skeleton or tuning panel is open. */
  setDebug(on: boolean): void {
    document.body.classList.toggle('debug', on);
  }

  /** Updates the hands readout and, on camera, invites the visitor to raise their hands after a moment. */
  setHands(left: boolean, right: boolean, camera: boolean): void {
    this.hands.textContent = `${left ? 'L' : '–'} ${right ? 'R' : '–'}`;
    const now = performance.now();
    if (left || right || !camera || this.onLanding) this.handsGoneSince = now;
    this.prompt.classList.toggle('show', now - this.handsGoneSince > PROMPT_DELAY);
  }

  /** Short message. While recording, only `important` messages show. */
  toast(msg: string, ms = 2400, important = false): void {
    if (this.recording && !important) return;
    this.toastEl.textContent = msg;
    // Single words get the display treatment, sentences stay quiet
    this.toastEl.classList.toggle('toast--word', msg.length <= 16);
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  toggleHelp(force?: boolean): void {
    const open = force ?? !!this.help.hidden;
    this.help.hidden = !open;
    this.helpBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('help-open', open);
    if (open) this.wake();
  }

  toggleRecording(): void {
    this.recording = !this.recording;
    document.body.classList.toggle('recording', this.recording);
    if (this.recording) {
      this.toggleHelp(false);
      this.toast('Recording mode · R or double-click to exit', 1800, true);
    } else {
      this.toast('Recording mode off', 1200, true);
    }
  }

  toggleFrameGuide(): void {
    this.frameGuide.hidden = !this.frameGuide.hidden;
    this.frameBtn.setAttribute('aria-pressed', String(!this.frameGuide.hidden));
  }

  loaderMessage(msg: string, error = false): void {
    this.loaderMsg.textContent = msg;
    this.loaderMsg.classList.toggle('error', error);
  }

  setLoaderBusy(busy: boolean): void {
    this.startCameraBtn.disabled = busy;
    this.startMouseBtn.disabled = busy;
    this.startCameraBtn.setAttribute('aria-busy', String(busy));
  }

  hideLoader(): void {
    this.loader.classList.add('gone');
    document.body.classList.remove('landing');
    this.wake();
  }

  /** Chrome fades out after a few seconds without input, so the frame belongs to the hands. */
  private wake(): void {
    document.body.classList.remove('idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (!this.help.hidden || this.dock.matches(':hover')) return this.wake();
      document.body.classList.add('idle');
    }, IDLE_AFTER);
  }
}
