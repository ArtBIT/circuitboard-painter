// ===============================================
// FLOW FIELD: 4 axes x 8 bits per cell, stored in a flat Uint8Array
// Axes: 0 = vertical, 1 = horizontal, 2 = diagonal TL-BR, 3 = diagonal BL-TR
// ===============================================

// 8-direction index -> flow axis
// 0:TL 1:up 2:TR 3:right 4:BR 5:down 6:BL 7:left
const DIR_TO_AXIS = [2, 0, 3, 1, 2, 0, 3, 1];

export function mapDirection8ToFlow4(direction8Index) {
    return DIR_TO_AXIS[((direction8Index % 8) + 8) % 8];
}

// Angle in radians (canvas space, y down) -> flow axis
export function angleToAxis(angle) {
    const TWO_PI = Math.PI * 2;
    const a = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
    return mapDirection8ToFlow4((Math.round(a / (TWO_PI / 8)) + 3) % 8);
}

// Grid geometry: cells are square and the grid is centered on the canvas
export function computeGeometry(width, height, cellSize) {
    const cols = Math.ceil(width / cellSize) + 1;
    const rows = Math.ceil(height / cellSize) + 1;
    return {
        width, height, cols, rows,
        cell: cellSize,
        ox: (width - cols * cellSize) / 2,
        oy: (height - rows * cellSize) / 2,
    };
}

// The flow field lives on its own fine grid, independent of the trace cell
// size, so changing the cell size never degrades painted strokes
export const FLOW_CELL = 8;

export class FlowField {
    constructor() {
        this.geom = null;
        this.data = new Uint8Array(0);
        this._sampler = null;
    }

    get cols() { return this.geom ? this.geom.cols : 0; }
    get rows() { return this.geom ? this.geom.rows : 0; }

    // Match the canvas size, resampling existing strokes so they stay where
    // they were relative to the canvas
    setViewport(width, height) {
        const g = this.geom;
        if (g && g.width === width && g.height === height) return;
        this.setGeometry(computeGeometry(width, height, FLOW_CELL));
    }

    setGeometry(geom) {
        const old = this.geom;
        const oldData = this.data;
        this.geom = geom;
        this.data = new Uint8Array(geom.cols * geom.rows * 4);
        this._sampler = null;
        if (old && oldData.length) this._resampleFrom(old, oldData);
    }

    _resampleFrom(old, oldData) {
        const g = this.geom;
        const scaleX = old.width / g.width;
        const scaleY = old.height / g.height;
        if (!oldData.some((v) => v)) return;
        for (let y = 0; y < g.rows; y++) {
            const py = (g.oy + (y + 0.5) * g.cell) * scaleY;
            const oy = Math.floor((py - old.oy) / old.cell);
            if (oy < 0 || oy >= old.rows) continue;
            for (let x = 0; x < g.cols; x++) {
                const px = (g.ox + (x + 0.5) * g.cell) * scaleX;
                const ox = Math.floor((px - old.ox) / old.cell);
                if (ox < 0 || ox >= old.cols) continue;
                const src = (oy * old.cols + ox) * 4;
                const dst = (y * g.cols + x) * 4;
                this.data[dst] = oldData[src];
                this.data[dst + 1] = oldData[src + 1];
                this.data[dst + 2] = oldData[src + 2];
                this.data[dst + 3] = oldData[src + 3];
            }
        }
    }

    /**
     * Map every cell of another grid (the trace grid) to the offset of the
     * flow cell under its center, or -1 when outside the field.
     */
    sampler(geom) {
        const cached = this._sampler;
        if (cached && cached.geom === geom) return cached.map;
        const g = this.geom;
        const map = new Int32Array(geom.cols * geom.rows).fill(-1);
        if (g) {
            for (let y = 0; y < geom.rows; y++) {
                const fy = Math.floor((geom.oy + (y + 0.5) * geom.cell - g.oy) / g.cell);
                if (fy < 0 || fy >= g.rows) continue;
                for (let x = 0; x < geom.cols; x++) {
                    const fx = Math.floor((geom.ox + (x + 0.5) * geom.cell - g.ox) / g.cell);
                    if (fx >= 0 && fx < g.cols) map[y * geom.cols + x] = (fy * g.cols + fx) * 4;
                }
            }
        }
        this._sampler = { geom, map };
        return map;
    }

    clear() { this.data.fill(0); }

    isEmpty() {
        for (let i = 0; i < this.data.length; i++) if (this.data[i]) return false;
        return true;
    }

    add(x, y, axis, amount) {
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
        const i = (y * this.cols + x) * 4 + axis;
        this.data[i] = Math.min(255, this.data[i] + amount);
    }

    // Erase every axis of a cell
    sub(x, y, amount) {
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
        const i = (y * this.cols + x) * 4;
        for (let a = 0; a < 4; a++) this.data[i + a] = Math.max(0, this.data[i + a] - amount);
    }

    snapshot() {
        return { geom: this.geom, data: this.data.slice() };
    }

    // Restore a snapshot, resampling it into the current geometry
    restore(snap) {
        const current = this.geom;
        if (!snap.geom) {
            this.clear();
            return;
        }
        this.geom = snap.geom;
        this.data = snap.data.slice();
        this._sampler = null;
        if (current && (current.width !== snap.geom.width || current.height !== snap.geom.height)) {
            this.setGeometry(current);
        }
    }
}

// ---------- Compact encoding (for share links and local persistence) ----------

function toBase64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function pipe(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
}

const canCompress = typeof CompressionStream !== 'undefined';

// Header: width, height, cols, rows, cell (float32 x 5) followed by raw data
export async function encodeFlow(field) {
    if (!field.geom || field.isEmpty() || !canCompress) return '';
    const g = field.geom;
    const header = new Float32Array([g.width, g.height, g.cols, g.rows, g.cell]);
    const bytes = new Uint8Array(20 + field.data.length);
    bytes.set(new Uint8Array(header.buffer), 0);
    bytes.set(field.data, 20);
    return toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

export async function decodeFlow(str) {
    if (!str || !canCompress) return null;
    try {
        const bytes = await pipe(fromBase64Url(str), new DecompressionStream('deflate-raw'));
        const h = new Float32Array(bytes.slice(0, 20).buffer);
        const [width, height, cols, rows, cell] = h;
        if (!(cols > 0 && rows > 0 && cell > 0) || bytes.length !== 20 + cols * rows * 4) return null;
        const geom = computeGeometry(width, height, cell);
        if (geom.cols !== cols || geom.rows !== rows) return null;
        return { geom, data: bytes.slice(20) };
    } catch {
        return null;
    }
}
