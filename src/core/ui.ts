import type { SceneDef } from '../scenes/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** DOM chrome: loader, scene menu, HUD, help, toast, recording mode and 9:16 guide. */
export class UI {
  readonly startCameraBtn = $<HTMLButtonElement>('start-camera');
  readonly startMouseBtn = $<HTMLButtonElement>('start-mouse');
  private loader = $('loader');
  private loaderMsg = $('loader-msg');
  private menu = $('menu');
  private fps = $('fps');
  private source = $('source');
  private hands = $('hands');
  private help = $('help');
  private toastEl = $('toast');
  private frameGuide = $('frame-guide');
  private toastTimer = 0;
  private buttons = new Map<string, HTMLButtonElement>();
  recording = false;

  constructor(scenes: SceneDef[], onSelect: (def: SceneDef) => void) {
    for (const def of scenes) {
      const btn = document.createElement('button');
      btn.className = 'scene-btn';
      btn.disabled = !def.load;
      btn.innerHTML = `<kbd>${def.key}</kbd><span class="label">${def.title}</span>${def.load ? '' : '<span class="soon">soon</span>'}`;
      btn.title = def.load ? `${def.title} (${def.key})` : `${def.title}: coming soon`;
      btn.addEventListener('click', () => onSelect(def));
      this.menu.appendChild(btn);
      this.buttons.set(def.id, btn);
    }
    $('help-btn').addEventListener('click', () => this.toggleHelp());
  }

  setActiveScene(id: string): void {
    for (const [key, btn] of this.buttons) btn.setAttribute('aria-current', String(key === id));
  }

  setStats(fps: number, inferenceMs: number | null): void {
    this.fps.textContent = inferenceMs === null ? `${fps} fps` : `${fps} fps · ${inferenceMs.toFixed(0)} ms`;
  }

  setSource(text: string): void {
    this.source.textContent = text;
  }

  setHands(left: boolean, right: boolean): void {
    this.hands.textContent = left || right ? `${left ? 'L' : '·'} ${right ? 'R' : '·'}` : 'no hands';
  }

  toast(msg: string, ms = 2800): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  toggleHelp(force?: boolean): void {
    this.help.hidden = !(force ?? this.help.hidden);
  }

  toggleRecording(): void {
    this.recording = !this.recording;
    document.body.classList.toggle('recording', this.recording);
    if (this.recording) this.toast('Recording mode · R to exit · F for 9:16 guide', 1600);
    else this.toast('Recording mode off', 1200);
  }

  toggleFrameGuide(): void {
    this.frameGuide.hidden = !this.frameGuide.hidden;
  }

  loaderMessage(msg: string, error = false): void {
    this.loaderMsg.textContent = msg;
    this.loaderMsg.classList.toggle('error', error);
  }

  setLoaderBusy(busy: boolean): void {
    this.startCameraBtn.disabled = busy;
    this.startMouseBtn.disabled = busy;
  }

  hideLoader(): void {
    this.loader.classList.add('gone');
  }
}
