// EXPLORE PAD: on-screen game controls for Explore's walk mode (core/explore.js), drawn over the film on
// phones and tablets — a virtual joystick bottom-left (push to walk, push to the rim to run), buttons
// bottom-right (jump, run, fly; up / down while flying; back to the film's view), and a WALK / ORBIT switch.
// Looking around is the rest of the screen: drag anywhere outside the controls (core/explore.js).
// The pad only writes the explorer's input state (`explorer.pad`); the explorer moves the character.

const ICON = {
  jump: '<svg viewBox="0 0 24 24"><path d="M12 4l7 8h-4v8h-6v-8H5z"/></svg>',
  run: '<svg viewBox="0 0 24 24"><path d="M5 6l7 6-7 6zM12 6l7 6-7 6z"/></svg>',
  fly: '<svg viewBox="0 0 24 24"><path d="M2 14l9-2V5l2-2 2 2v7l9 2v2l-9-1v4l2 2v1l-4-1-4 1v-1l2-2v-4l-9 1z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 6l7 9H5z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 18L5 9h14z"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M12 5a7 7 0 1 1-6.6 9.3l1.9-.6A5 5 0 1 0 12 7v3L7.5 6 12 2z"/></svg>',
};

export class ExplorePad {
  constructor(explorer, { touch = false } = {}) {
    this.ex = explorer;
    this.touch = touch;
    const el = this.el = document.createElement('div');
    el.className = 'xpad';
    el.innerHTML = `
      <div class="xpad-mode" role="group" aria-label="Explore mode">
        <button type="button" data-mode="walk" aria-pressed="false">Walk</button><button type="button" data-mode="orbit" aria-pressed="false">Orbit</button><button type="button" class="xpad-exit" aria-label="Leave explore">✕</button>
      </div>
      <div class="xpad-stick" aria-label="Move: drag the stick"><div class="xpad-knob"></div></div>
      <div class="xpad-btns">
        <button type="button" class="xpad-b xpad-up" data-hold="up" aria-label="Fly up">${ICON.up}</button>
        <button type="button" class="xpad-b xpad-down" data-hold="down" aria-label="Fly down">${ICON.down}</button>
        <button type="button" class="xpad-b xpad-jump" data-tap="jump" aria-label="Jump">${ICON.jump}</button>
        <button type="button" class="xpad-b xpad-run" data-toggle="run" aria-label="Run" aria-pressed="false">${ICON.run}</button>
        <button type="button" class="xpad-b xpad-fly" data-act="fly" aria-label="Fly" aria-pressed="false">${ICON.fly}</button>
        <button type="button" class="xpad-b xpad-home" data-act="home" aria-label="Back to the film's view">${ICON.home}</button>
      </div>`;
    document.body.appendChild(el);
    this._bind();
    explorer.onMode = (mode, fly) => this.sync(mode, fly);
    this.sync(explorer.mode, explorer.walk.fly);
  }

  show(on) { document.body.classList.toggle('xpad-on', !!on); if (!on) this._release(); }

  sync(mode, fly) {
    document.body.classList.toggle('xpad-walk', mode === 'walk');
    document.body.classList.toggle('xpad-flying', !!fly);
    document.body.classList.toggle('xpad-touch', this.touch);
    for (const b of this.el.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    this.el.querySelector('.xpad-fly').setAttribute('aria-pressed', String(!!fly));
  }

  _release() {
    const p = this.ex.pad;
    p.mx = p.my = 0; p.up = p.down = p.jump = false;
    this.knob.style.transform = '';
  }

  _bind() {
    const ex = this.ex, p = ex.pad, el = this.el;
    // the controls never reach the canvas underneath (that's the look area)
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'dblclick', 'contextmenu']) {
      el.addEventListener(ev, (e) => { if (e.target !== el) e.stopPropagation(); });
    }
    el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => ex.setMode(b.dataset.mode)));
    el.querySelector('.xpad-exit').addEventListener('click', () => document.getElementById('btn-explore')?.click());
    // joystick: the knob follows the finger within the ring; past 90% of the rim the character runs
    const stick = el.querySelector('.xpad-stick'), knob = this.knob = el.querySelector('.xpad-knob');
    let sid = null, cx = 0, cy = 0;
    const move = (e) => {
      const r = stick.clientWidth / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > r) { dx *= r / d; dy *= r / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      p.mx = dx / r; p.my = -dy / r;
      this._rimRun = d / r > 0.92;
      p.run = this._rimRun || this._runOn;
    };
    stick.addEventListener('pointerdown', (e) => {
      sid = e.pointerId; stick.setPointerCapture(sid);
      const b = stick.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2;
      move(e); e.preventDefault();
    });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) move(e); });
    const end = (e) => { if (e.pointerId !== sid) return; sid = null; p.mx = p.my = 0; this._rimRun = false; p.run = !!this._runOn; knob.style.transform = ''; };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    // buttons: hold (up / down), tap (jump), toggle (run), actions (fly, home)
    el.querySelectorAll('[data-hold]').forEach((b) => {
      const k = b.dataset.hold;
      b.addEventListener('pointerdown', (e) => { p[k] = true; b.setPointerCapture(e.pointerId); b.classList.add('down'); e.preventDefault(); });
      const off = () => { p[k] = false; b.classList.remove('down'); };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
    });
    el.querySelectorAll('[data-tap]').forEach((b) => b.addEventListener('pointerdown', (e) => { p[b.dataset.tap] = true; e.preventDefault(); }));
    el.querySelector('[data-toggle="run"]').addEventListener('click', (e) => {
      this._runOn = !this._runOn; p.run = this._runOn || !!this._rimRun;
      e.currentTarget.setAttribute('aria-pressed', String(this._runOn));
    });
    el.querySelector('[data-act="fly"]').addEventListener('click', () => ex.toggleFly());
    el.querySelector('[data-act="home"]').addEventListener('click', () => ex.recentre());
  }
}
