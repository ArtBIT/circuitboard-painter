// ===============================================
// User interface: panel controls, tooltips, toasts, dialogs
// ===============================================
import { DEFAULTS, RANGES, PALETTES } from './params.js';
import { icon, hydrateIcons, setIcon } from './icons.js';
import { store } from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const pct = { format: (v) => `${Math.round(v * 100)}`, parse: (s) => parseFloat(s) / 100, unit: '%' };
const int = (unit = '') => ({ format: (v) => `${Math.round(v)}`, parse: parseFloat, unit });
const dec = { format: (v) => (+v).toFixed(1), parse: parseFloat, unit: '' };

const SECTIONS = [
    {
        id: 'brush', title: 'Flow brush',
        fields: [
            { key: 'brushSize', label: 'Size', ...int(' cells'), tip: 'Brush radius in grid cells' },
            { key: 'brushOpacity', label: 'Strength', ...pct, tip: 'How much flow one pass adds' },
            { key: 'angleSmoothing', label: 'Responsiveness', ...pct, tip: 'Lower values smooth out shaky strokes' },
            { key: 'flowInfluence', label: 'Flow influence', ...pct, tip: 'How strongly traces obey the painted flow' },
            {
                key: 'updateMode', type: 'segmented', label: 'Update traces',
                options: [['release', 'On release'], ['live', 'Live'], ['manual', 'Manual']],
                tip: 'When the board is regrown after painting',
            },
        ],
    },
    {
        id: 'board', title: 'Board',
        fields: [
            { key: 'seed', type: 'seed', label: 'Seed' },
            { key: 'cellSize', label: 'Cell size', ...int(' px'), tip: 'Grid pitch. Smaller cells give denser boards' },
            { key: 'wireLength', label: 'Max trace length', ...int(), tip: 'Longest trace, in cells' },
            { key: 'cutOffLength', label: 'Min trace length', ...int(), tip: 'Shorter traces are hidden' },
            { key: 'straightness', label: 'Straightness', ...dec, tip: 'Higher values produce fewer bends' },
            { key: 'density', label: 'Density', ...pct, tip: 'Fraction of cells that start a trace' },
        ],
    },
    {
        id: 'style', title: 'Style',
        fields: [
            { type: 'palettes' },
            { type: 'colors' },
            {
                key: 'padStyle', type: 'segmented', label: 'Pads',
                options: [['ring', 'Ring'], ['dot', 'Dot'], ['square', 'Square'], ['none', 'None']],
            },
            { key: 'wireWidth', label: 'Trace width', ...pct },
            { key: 'padSize', label: 'Pad size', ...pct },
            { key: 'glow', label: 'Glow', ...pct },
            { key: 'showGrid', type: 'toggle', label: 'Show grid', shortcut: 'G' },
        ],
    },
    {
        id: 'export', title: 'Export',
        fields: [
            {
                key: 'exportScale', type: 'segmented', label: 'Resolution',
                options: [[1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], hint: 'exportSize',
            },
            { key: 'transparentBg', type: 'toggle', label: 'Transparent background' },
            { type: 'export' },
        ],
    },
];

export const SHORTCUTS = [
    ['Painting', [
        ['B', 'Flow brush'], ['L', 'Straight guide'], ['E', 'Eraser'],
        ['Right-drag', 'Erase with any tool'], ['[ ]', 'Brush size'], ['Esc', 'Cancel current stroke'],
        ['Enter', 'Apply flow (manual)'], ['Del', 'Clear flow'],
    ]],
    ['Board', [
        ['R', 'New random board'], ['← →', 'Previous / next seed'], ['A', 'Play build animation'],
        ['F', 'Toggle flow overlay'], ['G', 'Toggle grid'],
    ]],
    ['General', [
        ['Ctrl Z', 'Undo'], ['Ctrl Shift Z', 'Redo'], ['Ctrl S', 'Save PNG'], ['Ctrl Shift S', 'Save SVG'],
        ['P', 'Toggle settings panel'], ['H', 'Hide interface'], ['?', 'This help'],
    ]],
];

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const kbd = (combo) => combo.split(' ').filter(Boolean)
    .map((k) => `<kbd>${esc(k === 'Ctrl' && isMac ? '⌘' : k)}</kbd>`).join('');

export function createUI(app) {
    const params = app.params;
    const body = $('#panelBody');
    const syncers = [];
    const openState = loadOpenState();

    // ---------- Build the panel ----------
    for (const section of SECTIONS) {
        const details = document.createElement('details');
        details.className = 'section';
        details.open = openState[section.id] !== false;
        details.innerHTML = `<summary><span>${esc(section.title)}</span>${icon('chevron')}</summary><div class="section-body"></div>`;
        details.addEventListener('toggle', () => {
            openState[section.id] = details.open;
            store.set('cbp:sections', JSON.stringify(openState));
        });
        const inner = $('.section-body', details);
        for (const field of section.fields) inner.appendChild(buildField(field));
        body.appendChild(details);
    }

    function buildField(f) {
        switch (f.type) {
            case 'segmented': return segmented(f);
            case 'toggle': return toggle(f);
            case 'seed': return seedField();
            case 'palettes': return palettes();
            case 'colors': return colors();
            case 'export': return exportButtons();
            default: return range(f);
        }
    }

    function range(f) {
        const [min, max, step] = RANGES[f.key];
        const el = document.createElement('div');
        el.className = 'field range';
        const id = `f-${f.key}`;
        el.innerHTML = `
            <div class="field-row">
                <label for="${id}" title="${esc(f.tip ? f.tip + '. ' : '')}Double-click to reset">${esc(f.label)}</label>
                <span class="value"><input type="text" inputmode="decimal" aria-label="${esc(f.label)} value" spellcheck="false"><span class="unit">${esc(f.unit.trim())}</span></span>
            </div>
            <input type="range" id="${id}" min="${min}" max="${max}" step="${step}">`;
        const slider = $('input[type=range]', el);
        const text = $('input[type=text]', el);
        const label = $('label', el);

        const paint = () => {
            const v = params[f.key];
            slider.value = v;
            slider.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
            if (document.activeElement !== text) text.value = f.format(v);
        };
        const set = (v, commit) => {
            v = Math.min(max, Math.max(min, Math.round(v / step) * step));
            app.setParam(f.key, +v.toFixed(4), commit);
        };
        slider.addEventListener('input', () => set(parseFloat(slider.value), false));
        slider.addEventListener('change', () => set(parseFloat(slider.value), true));
        const commitText = () => {
            const v = f.parse(text.value);
            if (Number.isFinite(v)) set(v, true);
            text.value = f.format(params[f.key]);
        };
        text.addEventListener('change', commitText);
        text.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { commitText(); text.blur(); }
            if (e.key === 'Escape') { text.value = f.format(params[f.key]); text.blur(); }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                set(params[f.key] + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1), true);
                text.value = f.format(params[f.key]);
            }
        });
        text.addEventListener('focus', () => text.select());
        label.addEventListener('dblclick', () => set(DEFAULTS[f.key], true));
        syncers.push(paint);
        paint();
        return el;
    }

    function segmented(f) {
        const el = document.createElement('div');
        el.className = 'field';
        el.innerHTML = `<div class="field-row"><span class="label" ${f.tip ? `title="${esc(f.tip)}"` : ''}>${esc(f.label)}</span>${f.hint ? '<span class="hint" data-hint></span>' : ''}</div>
            <div class="segmented" role="radiogroup" aria-label="${esc(f.label)}">
                ${f.options.map(([v, l]) => `<button type="button" role="radio" data-value="${esc(v)}">${esc(l)}</button>`).join('')}
            </div>`;
        const buttons = [...el.querySelectorAll('button')];
        const hint = $('[data-hint]', el);
        buttons.forEach((b, i) => {
            b.addEventListener('click', () => app.setParam(f.key, f.options[i][0], true));
            b.addEventListener('keydown', (e) => {
                const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                const next = buttons[(i + d + buttons.length) % buttons.length];
                next.focus();
                next.click();
            });
        });
        syncers.push(() => {
            buttons.forEach((b, i) => {
                const on = f.options[i][0] === params[f.key];
                b.setAttribute('aria-checked', on);
                b.tabIndex = on ? 0 : -1;
            });
            if (hint) hint.textContent = app.hint(f.hint);
        });
        return el;
    }

    function toggle(f) {
        const el = document.createElement('label');
        el.className = 'field toggle';
        el.innerHTML = `<span>${esc(f.label)}${f.shortcut ? ` ${kbd(f.shortcut)}` : ''}</span><input type="checkbox" role="switch"><span class="switch" aria-hidden="true"></span>`;
        const input = $('input', el);
        input.addEventListener('change', () => app.setParam(f.key, input.checked, true));
        syncers.push(() => { input.checked = !!params[f.key]; });
        return el;
    }

    function seedField() {
        const el = document.createElement('div');
        el.className = 'field seed';
        el.innerHTML = `
            <label for="f-seed" class="label">Seed</label>
            <div class="stepper">
                <button type="button" class="icon-btn small" data-d="-1" aria-label="Previous seed" data-tip="Previous seed" data-key="←">${icon('minus')}</button>
                <input id="f-seed" type="text" inputmode="numeric" spellcheck="false">
                <button type="button" class="icon-btn small" data-d="1" aria-label="Next seed" data-tip="Next seed" data-key="→">${icon('plus')}</button>
                <button type="button" class="icon-btn small accent" data-random aria-label="Random seed" data-tip="Random seed" data-key="R">${icon('dice')}</button>
            </div>`;
        const input = $('input', el);
        el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => app.stepSeed(+b.dataset.d)));
        $('[data-random]', el).addEventListener('click', () => app.newSeed());
        const commit = () => {
            const v = parseInt(input.value, 10);
            if (Number.isFinite(v)) app.setParam('seed', Math.min(RANGES.seed[1], Math.max(0, v)), true);
            input.value = params.seed;
        };
        input.addEventListener('change', commit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { commit(); input.blur(); }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); app.stepSeed(e.key === 'ArrowUp' ? 1 : -1); }
        });
        input.addEventListener('focus', () => input.select());
        syncers.push(() => { if (document.activeElement !== input) input.value = params.seed; });
        return el;
    }

    function palettes() {
        const el = document.createElement('div');
        el.className = 'field';
        el.innerHTML = `<div class="field-row"><span class="label">Palette</span>
            <button type="button" class="text-btn" data-shuffle>${icon('shuffle')}Surprise me</button></div>
            <div class="palettes">${PALETTES.map((p, i) => `
                <button type="button" class="swatch" data-i="${i}" aria-label="${esc(p.name)} palette" data-tip="${esc(p.name)}" style="--bg:${p.bg};--fg:${p.fg};--pad:${p.pad}">
                    <svg viewBox="0 0 40 28" aria-hidden="true"><path d="M-2 20h12l8-8h24M-2 8h8l5 5" fill="none" stroke="var(--fg)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="25" cy="20" r="3" fill="var(--pad)" stroke="var(--fg)" stroke-width="1.8"/></svg>
                </button>`).join('')}</div>`;
        const swatches = [...el.querySelectorAll('.swatch')];
        swatches.forEach((b) => b.addEventListener('click', () => app.applyPalette(PALETTES[+b.dataset.i])));
        $('[data-shuffle]', el).addEventListener('click', () => app.surprise());
        syncers.push(() => {
            swatches.forEach((b, i) => {
                const p = PALETTES[i];
                b.setAttribute('aria-pressed', p.bg === params.bgColor && p.fg === params.fgColor && p.pad === params.padColor);
            });
        });
        return el;
    }

    function colors() {
        const el = document.createElement('div');
        el.className = 'field colors';
        const items = [['bgColor', 'Background'], ['fgColor', 'Traces'], ['padColor', 'Pads']];
        el.innerHTML = items.map(([k, l]) => `
            <label class="color">
                <span class="chip"><input type="color" data-key="${k}" aria-label="${l} color"></span>
                <span class="color-text"><span>${l}</span><code data-code="${k}"></code></span>
            </label>`).join('');
        el.querySelectorAll('input').forEach((input) => {
            const k = input.dataset.key;
            input.addEventListener('input', () => app.setParam(k, input.value, false));
            input.addEventListener('change', () => app.setParam(k, input.value, true));
        });
        syncers.push(() => {
            el.querySelectorAll('input').forEach((input) => {
                const v = params[input.dataset.key];
                input.value = v;
                input.parentElement.style.setProperty('--c', v);
            });
            el.querySelectorAll('[data-code]').forEach((c) => { c.textContent = params[c.dataset.code].toUpperCase(); });
        });
        return el;
    }

    function exportButtons() {
        const el = document.createElement('div');
        el.className = 'field export';
        el.innerHTML = `
            <div class="btn-row">
                <button type="button" class="btn primary" data-a="png">${icon('download')}PNG</button>
                <button type="button" class="btn primary" data-a="svg">${icon('download')}SVG</button>
            </div>
            <div class="btn-row">
                <button type="button" class="btn" data-a="copyImage">${icon('copy')}Copy image</button>
                <button type="button" class="btn" data-a="copyLink">${icon('link')}Share link</button>
            </div>
            <button type="button" class="text-btn danger reset" data-a="reset">${icon('reset')}Reset everything</button>`;
        const actions = {
            png: () => app.exportPNG(), svg: () => app.exportSVG(),
            copyImage: () => app.copyImage(), copyLink: () => app.copyLink(), reset: () => app.reset(),
        };
        el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', actions[b.dataset.a]));
        return el;
    }

    // ---------- Toolbar ----------
    const toolButtons = [...document.querySelectorAll('[data-tool]')];
    toolButtons.forEach((b) => b.addEventListener('click', () => app.setParam('tool', b.dataset.tool, false)));
    $('#undoBtn').addEventListener('click', () => app.undo());
    $('#redoBtn').addEventListener('click', () => app.redo());
    $('#seedBtn').addEventListener('click', () => app.newSeed());
    $('#flowBtn').addEventListener('click', () => app.setParam('showFlowGrid', !params.showFlowGrid, false));
    $('#animateBtn').addEventListener('click', () => app.animate());
    $('#clearBtn').addEventListener('click', () => app.clearFlow());
    $('#applyBtn').addEventListener('click', () => app.applyFlow());
    $('#panelToggle').addEventListener('click', () => setPanel(!panelOpen));
    $('#panelFab').addEventListener('click', () => setPanel(!panelOpen));
    $('#panelClose').addEventListener('click', () => setPanel(false));
    $('#helpBtn').addEventListener('click', () => openHelp());

    syncers.push(() => {
        toolButtons.forEach((b) => {
            const on = b.dataset.tool === params.tool;
            b.setAttribute('aria-checked', on);
        });
        const flowBtn = $('#flowBtn');
        flowBtn.setAttribute('aria-pressed', params.showFlowGrid);
        if (flowBtn.dataset.icon !== (params.showFlowGrid ? 'eye' : 'eyeOff')) setIcon(flowBtn, params.showFlowGrid ? 'eye' : 'eyeOff');
        flowBtn.dataset.tip = params.showFlowGrid ? 'Hide flow field' : 'Show flow field';
    });

    // ---------- Panel visibility ----------
    const narrow = window.matchMedia('(max-width: 760px)');
    let panelOpen = !narrow.matches && store.get('cbp:panel') !== 'closed';
    function setPanel(open, persist = true) {
        panelOpen = open;
        document.body.classList.toggle('panel-closed', !open);
        $('#panelToggle').setAttribute('aria-expanded', open);
        $('#panelFab').setAttribute('aria-expanded', open);
        if (persist && !narrow.matches) {
            store.set('cbp:panel', open ? 'open' : 'closed');
        }
    }
    setPanel(panelOpen, false);
    narrow.addEventListener('change', () => setPanel(!narrow.matches && store.get('cbp:panel') !== 'closed', false));

    // ---------- Help dialog ----------
    const dialog = $('#helpDialog');
    $('#shortcutGrid').innerHTML = SHORTCUTS.map(([group, rows]) => `
        <section><h3>${esc(group)}</h3><dl>${rows.map(([k, d]) => `<div><dt>${kbd(k)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl></section>`).join('');
    dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    function openHelp() { if (!dialog.open) dialog.showModal(); }

    // ---------- Tooltips ----------
    const tooltip = $('#tooltip');
    let tipTimer = null, tipTarget = null;
    function showTip(el) {
        tipTarget = el;
        tooltip.innerHTML = `${esc(el.dataset.tip)}${el.dataset.key ? ` <span class="keys">${kbd(el.dataset.key)}</span>` : ''}`;
        tooltip.hidden = false;
        const r = el.getBoundingClientRect();
        const t = tooltip.getBoundingClientRect();
        let x = r.left + r.width / 2 - t.width / 2;
        let y = r.bottom + 8;
        if (y + t.height > window.innerHeight - 8) y = r.top - t.height - 8;
        x = Math.max(8, Math.min(window.innerWidth - t.width - 8, x));
        tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    function hideTip() { clearTimeout(tipTimer); tipTarget = null; tooltip.hidden = true; }
    document.addEventListener('pointerover', (e) => {
        if (e.pointerType !== 'mouse') return;
        const el = e.target.closest('[data-tip]');
        if (el === tipTarget) return;
        hideTip();
        if (el) tipTimer = setTimeout(() => showTip(el), 450);
    });
    document.addEventListener('pointerdown', hideTip);
    document.addEventListener('focusin', (e) => {
        const el = e.target.closest('[data-tip]');
        if (el && el.matches(':focus-visible')) showTip(el); else hideTip();
    });
    document.addEventListener('focusout', hideTip);

    // ---------- Toasts ----------
    const toasts = $('#toasts');
    function toast(message, { iconName = 'check', tone = '' } = {}) {
        const el = document.createElement('div');
        el.className = `toast glass ${tone}`;
        el.innerHTML = `${icon(iconName)}<span>${esc(message)}</span>`;
        toasts.appendChild(el);
        while (toasts.children.length > 3) toasts.firstChild.remove();
        setTimeout(() => {
            el.classList.add('out');
            setTimeout(() => el.remove(), 250);
        }, 2400);
    }

    // ---------- Status ----------
    const touch = window.matchMedia('(hover: none)').matches;
    const HINTS = {
        brush: touch ? 'Drag to paint flow' : 'Drag to paint flow. Traces bend to follow your strokes.',
        line: touch ? 'Drag to draw a straight guide' : 'Drag to draw a straight guide. Snaps to 45°.',
        eraser: touch ? 'Drag to erase flow' : 'Drag to erase flow. Right-drag erases with any tool.',
    };
    function sync() {
        for (const s of syncers) s();
        $('#hint').textContent = HINTS[params.tool];
    }

    function setHistoryState(canUndo, canRedo) {
        $('#undoBtn').disabled = !canUndo;
        $('#redoBtn').disabled = !canRedo;
    }

    function setStats(text) { $('#stats').textContent = text; }

    function setDirty(dirty) { $('#applyBtn').hidden = !dirty; }

    hydrateIcons();
    sync();

    return {
        sync, toast, setHistoryState, setStats, setDirty, openHelp,
        togglePanel: () => setPanel(!panelOpen),
        closeOverlays() {
            if (dialog.open) { dialog.close(); return true; }
            if (narrow.matches && panelOpen) { setPanel(false); return true; }
            return false;
        },
        get dialogOpen() { return dialog.open; },
    };
}

function loadOpenState() {
    try { return JSON.parse(store.get('cbp:sections')) || {}; } catch { return {}; }
}
