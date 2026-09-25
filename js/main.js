// ===============================================
// Application: state, rendering loop and actions
// ===============================================
import { params, DEFAULTS, RANGES, PALETTES, sanitize, pickShared } from './params.js';
import { FlowField, computeGeometry, encodeFlow, decodeFlow } from './flowGrid.js';
import { generateWires } from './generator.js';
import { renderBoard, renderFlow, renderGrid, renderSVG } from './renderer.js';
import { createPainter } from './painter.js';
import { History } from './history.js';
import { createUI } from './ui.js';
import { store } from './store.js';

// Parameters that change the layout, and those that only change the look
const GEN_KEYS = new Set(['cellSize', 'wireLength', 'cutOffLength', 'straightness', 'density', 'seed', 'flowInfluence']);
const STYLE_KEYS = new Set(['bgColor', 'fgColor', 'padColor', 'wireWidth', 'padSize', 'padStyle', 'glow']);
// Parameters that belong to the artwork and are covered by undo
const ART_KEYS = [...GEN_KEYS, ...STYLE_KEYS];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const layer = document.createElement('canvas'); // cached board, redrawn only when needed
const layerCtx = layer.getContext('2d');
const cursorEl = document.getElementById('cursor');

const flow = new FlowField();
const history = new History(40);
let geom = null;
let wires = [];
let dpr = 1;
let pending = null;      // snapshot taken before an in-progress change
let dirty = false;       // flow painted but not yet applied (manual mode)
let overlay = { hover: null, line: null };
let animation = null;
let frameQueued = false;
let layerStale = true;
let lastGenMs = 0;
let lastFrameMs = 0;
let liveTimer = 0;
let strokeBefore = null;  // snapshot taken when a paint stroke starts

// ---------- Rendering ----------

function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    for (const c of [canvas, layer]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
    }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
}

function regenerate() {
    const w = window.innerWidth, h = window.innerHeight;
    if (!geom || geom.cell !== params.cellSize || geom.width !== w || geom.height !== h) {
        geom = computeGeometry(w, h, params.cellSize);
    }
    flow.setViewport(w, h);
    const t0 = performance.now();
    wires = generateWires(params, geom, flow);
    lastGenMs = performance.now() - t0;
    dirty = false;
    ui.setDirty(false);
    updateStats();
    invalidate();
}

function invalidate() {
    layerStale = true;
    requestFrame();
}

function requestFrame() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(frame);
}

function frame(now) {
    frameQueued = false;
    const t0 = performance.now();
    let progress = 1;
    if (animation) {
        progress = Math.min(1, (now - animation.start) / animation.duration);
        progress = 1 - Math.pow(1 - progress, 3);
        layerStale = true;
        if (progress >= 1) animation = null;
        else requestFrame();
    }
    if (layerStale) {
        layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderBoard(layerCtx, wires, geom, params, { progress, pixelRatio: dpr });
        layerStale = false;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (params.showGrid) renderGrid(ctx, geom);
    if (params.showFlowGrid) renderFlow(ctx, flow, geom);
    if (overlay.line) drawGuide(overlay.line);
    lastFrameMs = performance.now() - t0;
}

function drawGuide({ x0, y0, x1, y1 }) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 138, 92, 0.35)';
    ctx.lineWidth = params.brushSize * geom.cell * 2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
}

function updateStats() {
    const n = wires.length;
    ui.setStats(`${n.toLocaleString()} traces · ${geom.cols - 2}×${geom.rows - 2} grid · ${Math.max(1, Math.round(lastGenMs))} ms`);
}

// ---------- State, history and persistence ----------

function snapshot() {
    const art = {};
    for (const k of ART_KEYS) art[k] = params[k];
    return { params: art, flow: flow.snapshot() };
}

function restore(snap) {
    Object.assign(params, snap.params);
    flow.restore(snap.flow);
    regenerate();
    ui.sync();
    persist();
}

function commit(before) {
    history.push(before);
    ui.setHistoryState(history.canUndo, history.canRedo);
    persist();
}

let persistTimer = 0;
function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
        store.set('cbp:params', JSON.stringify(params));
        store.set('cbp:flow', await encodeFlow(flow));
    }, 400);
}

async function load() {
    try { Object.assign(params, sanitize(JSON.parse(store.get('cbp:params')))); } catch { /* none saved */ }
    const saved = await decodeFlow(store.get('cbp:flow'));
    if (saved) flow.restore(saved);
    flow.setViewport(window.innerWidth, window.innerHeight);

    const hash = new URLSearchParams(location.hash.slice(1));
    if (!hash.has('s')) return false;
    window.history.replaceState(null, '', location.pathname + location.search);
    let shared = null;
    try {
        shared = sanitize(JSON.parse(atob(hash.get('s').replace(/-/g, '+').replace(/_/g, '/'))));
    } catch { /* malformed link */ }
    if (!shared) return false;

    // Keep the visitor's own board one undo away
    const before = snapshot();
    for (const k of ART_KEYS) params[k] = DEFAULTS[k];
    Object.assign(params, shared);
    const sharedFlow = await decodeFlow(hash.get('f'));
    if (sharedFlow) flow.restore(sharedFlow);
    else flow.clear();
    history.push(before);
    persist();
    return true;
}

// ---------- Actions ----------

function setParam(key, value, isCommit = true) {
    const art = ART_KEYS.includes(key);
    const changed = params[key] !== value;
    // Continuous edits (dragging a slider) collapse into one undo step
    if (art && changed && !pending) pending = snapshot();
    if (changed) {
        params[key] = value;
        if (GEN_KEYS.has(key)) regenerate();
        else if (STYLE_KEYS.has(key)) invalidate();
        else requestFrame();
        if (key === 'tool' || key === 'brushSize' || key === 'cellSize') updateCursor();
        persist();
    }
    if (art && isCommit && pending) {
        const before = pending;
        pending = null;
        if (ART_KEYS.some((k) => before.params[k] !== params[k])) commit(before);
    }
    ui.sync();
}

// Apply several artwork params as a single undoable step
function setMany(values) {
    const before = snapshot();
    Object.assign(params, values);
    commit(before);
    if (Object.keys(values).some((k) => GEN_KEYS.has(k))) regenerate();
    else invalidate();
    ui.sync();
}

const app = {
    params,
    setParam,
    hint(kind) {
        if (kind === 'exportSize') {
            const s = params.exportScale;
            return `${Math.round(window.innerWidth * s)} × ${Math.round(window.innerHeight * s)} px`;
        }
        return '';
    },
    newSeed() {
        let seed;
        do seed = Math.floor(Math.random() * 100000); while (seed === params.seed);
        setMany({ seed });
    },
    stepSeed(d) {
        setMany({ seed: Math.min(RANGES.seed[1], Math.max(0, params.seed + d)) });
    },
    applyPalette(p) {
        setMany({ bgColor: p.bg, fgColor: p.fg, padColor: p.pad });
    },
    surprise() {
        const pick = (a) => a[Math.floor(Math.random() * a.length)];
        const current = PALETTES.findIndex((p) => p.bg === params.bgColor && p.fg === params.fgColor);
        let p;
        do p = pick(PALETTES); while (PALETTES.indexOf(p) === current);
        setMany({
            bgColor: p.bg, fgColor: p.fg, padColor: p.pad,
            padStyle: pick(['ring', 'ring', 'dot', 'square']),
            wireWidth: pick([0.15, 0.2, 0.25, 0.3]),
            padSize: pick([0.2, 0.25, 0.3]),
            straightness: pick([2, 4, 7, 12]),
            wireLength: pick([8, 14, 24, 40]),
            glow: pick([0, 0, 0.3, 0.6]),
        });
    },
    undo() {
        if (painter.active) return;
        const snap = history.undo(snapshot());
        if (!snap) return;
        restore(snap);
        ui.setHistoryState(history.canUndo, history.canRedo);
    },
    redo() {
        if (painter.active) return;
        const snap = history.redo(snapshot());
        if (!snap) return;
        restore(snap);
        ui.setHistoryState(history.canUndo, history.canRedo);
    },
    clearFlow() {
        if (flow.isEmpty()) { ui.toast('The flow field is already empty', { iconName: 'info' }); return; }
        commit(snapshot());
        flow.clear();
        regenerate();
        ui.toast('Flow cleared. Undo with Ctrl+Z', { iconName: 'trash' });
    },
    applyFlow() { regenerate(); },
    animate() {
        if (reducedMotion.matches) { invalidate(); return; }
        animation = { start: performance.now(), duration: 1800 };
        requestFrame();
    },
    async exportPNG() {
        const blob = await renderToBlob();
        if (!blob) {
            ui.toast('That image is too large for this browser. Try a lower resolution.', { iconName: 'info', tone: 'warn' });
            return;
        }
        download(blob, `circuitboard-${params.seed}.png`);
        ui.toast(`Saved PNG (${Math.round(geom.width * params.exportScale)} × ${Math.round(geom.height * params.exportScale)})`, { iconName: 'download' });
    },
    exportSVG() {
        const svg = renderSVG(wires, geom, params, { transparent: params.transparentBg });
        download(new Blob([svg], { type: 'image/svg+xml' }), `circuitboard-${params.seed}.svg`);
        ui.toast('Saved SVG', { iconName: 'download' });
    },
    async copyImage() {
        try {
            if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('unsupported');
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderToBlob() })]);
            ui.toast('Image copied to clipboard', { iconName: 'copy' });
        } catch {
            ui.toast('Your browser cannot copy images. Use PNG instead.', { iconName: 'info', tone: 'warn' });
        }
    },
    async copyLink() {
        const s = btoa(JSON.stringify(pickShared(params))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const f = await encodeFlow(flow);
        const url = `${location.origin}${location.pathname}#s=${s}${f ? `&f=${f}` : ''}`;
        try {
            await navigator.clipboard.writeText(url);
            ui.toast(f ? 'Link copied, including your painted flow' : 'Link copied to clipboard', { iconName: 'link' });
        } catch {
            window.prompt('Copy this link:', url);
        }
    },
    reset() {
        const before = snapshot();
        const keep = { tool: params.tool };
        Object.assign(params, DEFAULTS, keep);
        flow.clear();
        commit(before);
        regenerate();
        ui.sync();
        updateCursor();
        ui.toast('Everything was reset. Undo with Ctrl+Z', { iconName: 'reset' });
    },
};

function renderToBlob() {
    const scale = params.exportScale;
    const out = document.createElement('canvas');
    out.width = Math.round(geom.width * scale);
    out.height = Math.round(geom.height * scale);
    const c = out.getContext('2d');
    c.setTransform(scale, 0, 0, scale, 0, 0);
    renderBoard(c, wires, geom, params, { transparent: params.transparentBg, pixelRatio: scale });
    return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Brush cursor ----------

function updateCursor() {
    const h = overlay.hover;
    if (!h || !geom) {
        cursorEl.classList.remove('visible');
        return;
    }
    const r = params.brushSize * geom.cell;
    cursorEl.style.width = cursorEl.style.height = `${r * 2}px`;
    cursorEl.style.transform = `translate(${h.x - r}px, ${h.y - r}px)`;
    cursorEl.dataset.tool = overlay.tool || params.tool;
    cursorEl.classList.add('visible');
}

// ---------- Setup ----------

const ui = createUI(app);

const painter = createPainter({
    canvas, flow, params,
    getCellSize: () => params.cellSize,
    onStrokeStart() {
        strokeBefore = snapshot();
    },
    onStroke() {
        if (params.updateMode === 'live') {
            // Throttle regeneration by its measured cost so big boards stay responsive
            const now = performance.now();
            if (now - liveTimer > Math.max(40, (lastGenMs + lastFrameMs) * 2.5)) {
                liveTimer = now;
                regenerate();
                return;
            }
        }
        requestFrame();
    },
    onStrokeEnd(changed) {
        if (changed) {
            commit(strokeBefore);
            if (params.updateMode === 'manual') {
                dirty = true;
                ui.setDirty(true);
            } else regenerate();
        }
        strokeBefore = null;
        overlay.line = null;
        requestFrame();
    },
    onCancel() {
        if (strokeBefore) flow.restore(strokeBefore.flow);
        strokeBefore = null;
        overlay.line = null;
        if (params.updateMode === 'live') regenerate();
        else requestFrame();
    },
    onOverlay(o) {
        const lineChanged = !!(o.line || overlay.line);
        overlay = o;
        updateCursor();
        if (lineChanged) requestFrame();
    },
});

// ---------- Keyboard ----------

function isTyping(e) {
    const t = e.target;
    return t instanceof HTMLElement && (t.isContentEditable || (t.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'radio', 'button'].includes(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (key === 'Escape') {
        if (painter.cancel()) { e.preventDefault(); return; }
        if (document.body.classList.contains('ui-hidden')) { toggleUi(); return; }
        ui.closeOverlays();
        return;
    }
    if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
    if (mod && key === 'y') { e.preventDefault(); app.redo(); return; }
    if (mod && key === 's') { e.preventDefault(); e.shiftKey ? app.exportSVG() : app.exportPNG(); return; }
    if (mod || e.altKey || isTyping(e) || ui.dialogOpen) return;
    // Range sliders keep their own arrow keys
    if (e.target instanceof HTMLInputElement && e.target.type === 'range' && key.startsWith('Arrow')) return;

    const actions = {
        b: () => setParam('tool', 'brush'),
        l: () => setParam('tool', 'line'),
        e: () => setParam('tool', 'eraser'),
        r: () => app.newSeed(),
        a: () => app.animate(),
        f: () => setParam('showFlowGrid', !params.showFlowGrid),
        g: () => setParam('showGrid', !params.showGrid),
        h: () => toggleUi(),
        p: () => ui.togglePanel(),
        '?': () => ui.openHelp(),
        '[': () => setParam('brushSize', Math.max(RANGES.brushSize[0], params.brushSize - 1)),
        ']': () => setParam('brushSize', Math.min(RANGES.brushSize[1], params.brushSize + 1)),
        ArrowLeft: () => app.stepSeed(-1),
        ArrowRight: () => app.stepSeed(1),
        Enter: () => { if (dirty) app.applyFlow(); else return false; },
        Delete: () => app.clearFlow(),
        Backspace: () => app.clearFlow(),
    };
    const action = actions[key];
    if (!action) return;
    if (key === 'Enter' && e.target instanceof HTMLButtonElement) return;
    if (action() !== false) e.preventDefault();
});

function toggleUi() {
    const hidden = document.body.classList.toggle('ui-hidden');
    if (hidden) ui.toast('Interface hidden. Press H or Esc to bring it back', { iconName: 'eyeOff' });
}

// ---------- Resize ----------

let resizeQueued = false;
window.addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
        resizeQueued = false;
        resize();
        regenerate();
        ui.sync();
    });
});

// ---------- Boot ----------

resize();
const fromLink = await load();
ui.sync();
updateCursor();
regenerate();
ui.setHistoryState(history.canUndo, history.canRedo);
if (fromLink) ui.toast('Opened a shared board. Undo returns to yours', { iconName: 'link' });
if (!reducedMotion.matches) app.animate();
document.body.classList.add('ready');
