// ===============================================
// Parameters, presets and (de)serialization
// ===============================================

export const DEFAULTS = Object.freeze({
    // Generation
    cellSize: 12,
    wireLength: 14,
    cutOffLength: 2,
    straightness: 7,
    density: 1,
    seed: 1,

    // Appearance
    bgColor: '#330533',
    fgColor: '#a3ccc2',
    padColor: '#330533',
    wireWidth: 0.25,   // relative to cell size
    padSize: 0.25,     // pad radius relative to cell size
    padStyle: 'ring',  // ring | dot | square | none
    glow: 0,           // 0..1
    showGrid: false,

    // Flow painting
    tool: 'brush',     // brush | line | eraser
    brushSize: 3,
    brushOpacity: 0.5,
    angleSmoothing: 0.3,
    flowInfluence: 1,
    updateMode: 'release', // release | live | manual
    showFlowGrid: true,

    // Export
    exportScale: 2,
    transparentBg: false,
});

// Ranges used by both the UI and the sanitizer
export const RANGES = {
    cellSize: [5, 80, 1],
    wireLength: [1, 100, 1],
    cutOffLength: [0, 10, 1],
    straightness: [0.1, 20, 0.1],
    density: [0.02, 1, 0.01],
    seed: [0, 999999, 1],
    wireWidth: [0.05, 0.6, 0.01],
    padSize: [0.1, 0.5, 0.01],
    glow: [0, 1, 0.01],
    brushSize: [1, 20, 1],
    brushOpacity: [0.05, 1, 0.05],
    angleSmoothing: [0.1, 1, 0.05],
    flowInfluence: [0, 1, 0.05],
    exportScale: [1, 4, 1],
};

export const ENUMS = {
    padStyle: ['ring', 'dot', 'square', 'none'],
    tool: ['brush', 'line', 'eraser'],
    updateMode: ['release', 'live', 'manual'],
};

export const PALETTES = [
    { name: 'Synth', bg: '#330533', fg: '#a3ccc2', pad: '#330533' },
    { name: 'FR-4', bg: '#0f3d1e', fg: '#d9b44a', pad: '#0f3d1e' },
    { name: 'Blueprint', bg: '#0b3a6e', fg: '#e8f1ff', pad: '#0b3a6e' },
    { name: 'Matrix', bg: '#050805', fg: '#3dff7a', pad: '#050805' },
    { name: 'Copper', bg: '#141013', fg: '#e07a3f', pad: '#f3c38b' },
    { name: 'Paper', bg: '#f4efe6', fg: '#26211c', pad: '#f4efe6' },
    { name: 'Neon', bg: '#0a0a1a', fg: '#ff3fa4', pad: '#28f0ff' },
    { name: 'Mono', bg: '#111111', fg: '#eeeeee', pad: '#111111' },
];

// Live parameter object shared by all modules
export const params = { ...DEFAULTS };

const HEX = /^#[0-9a-f]{6}$/i;

// Coerce an untrusted object (URL, localStorage) into valid params
export function sanitize(input) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    for (const key of Object.keys(DEFAULTS)) {
        if (!(key in input)) continue;
        const def = DEFAULTS[key];
        const val = input[key];
        if (typeof def === 'number') {
            const n = Number(val);
            if (!Number.isFinite(n)) continue;
            const r = RANGES[key];
            out[key] = r ? Math.min(r[1], Math.max(r[0], n)) : n;
        } else if (typeof def === 'boolean') {
            out[key] = Boolean(val);
        } else if (ENUMS[key]) {
            if (ENUMS[key].includes(val)) out[key] = val;
        } else if (key.endsWith('Color')) {
            if (HEX.test(val)) out[key] = val.toLowerCase();
        }
    }
    return out;
}

// Only the keys that describe the artwork go into share links
const SHARED_KEYS = [
    'cellSize', 'wireLength', 'cutOffLength', 'straightness', 'density', 'seed',
    'bgColor', 'fgColor', 'padColor', 'wireWidth', 'padSize', 'padStyle', 'glow', 'flowInfluence',
];

export function pickShared(p) {
    const out = {};
    for (const k of SHARED_KEYS) if (p[k] !== DEFAULTS[k]) out[k] = p[k];
    return out;
}
