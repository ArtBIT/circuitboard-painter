// ===============================================
// Rendering (canvas and SVG)
// ===============================================

const cx = (g, x) => g.ox + (x + 0.5) * g.cell;
const cy = (g, y) => g.oy + (y + 0.5) * g.cell;

/**
 * Draw the board. `progress` (0..1) grows every wire from its start pad,
 * which is used for the build animation.
 */
export function renderBoard(ctx, wires, geom, p, { transparent = false, progress = 1, pixelRatio = 1 } = {}) {
    const { width, height, cell } = geom;
    if (transparent) ctx.clearRect(0, 0, width, height);
    else {
        ctx.fillStyle = p.bgColor;
        ctx.fillRect(0, 0, width, height);
    }
    if (!wires.length) return;

    let maxCells = 0;
    for (const w of wires) maxCells = Math.max(maxCells, w.length / 2);
    const steps = progress >= 1 ? Infinity : progress * maxCells;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // shadowBlur ignores the transform, so scale it by hand
    const blur = p.glow * cell * 1.5 * pixelRatio;
    if (p.glow > 0) {
        ctx.shadowColor = p.fgColor;
        ctx.shadowBlur = blur;
    }

    // Traces: a single path is dramatically faster than one per wire
    ctx.beginPath();
    for (const w of wires) {
        const n = w.length / 2;
        ctx.moveTo(cx(geom, w[0]), cy(geom, w[1]));
        const whole = Math.min(n - 1, Math.floor(steps));
        for (let i = 1; i <= whole; i++) ctx.lineTo(cx(geom, w[i * 2]), cy(geom, w[i * 2 + 1]));
        const frac = steps - whole;
        if (whole < n - 1 && frac > 0) {
            const ax = cx(geom, w[whole * 2]), ay = cy(geom, w[whole * 2 + 1]);
            const bx = cx(geom, w[whole * 2 + 2]), by = cy(geom, w[whole * 2 + 3]);
            ctx.lineTo(ax + (bx - ax) * frac, ay + (by - ay) * frac);
        }
    }
    ctx.strokeStyle = p.fgColor;
    ctx.lineWidth = Math.max(0.5, cell * p.wireWidth);
    ctx.stroke();

    if (p.padStyle !== 'none') {
        const r = cell * p.padSize;
        const pads = new Path2D();
        for (const w of wires) {
            const n = w.length / 2;
            addPad(pads, p.padStyle, cx(geom, w[0]), cy(geom, w[1]), r);
            if (n > 1 && steps >= n - 1) addPad(pads, p.padStyle, cx(geom, w[n * 2 - 2]), cy(geom, w[n * 2 - 1]), r);
        }
        if (p.padStyle === 'dot') {
            ctx.fillStyle = p.fgColor;
            ctx.fill(pads);
        } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = p.padColor;
            ctx.fill(pads);
            if (p.glow > 0) ctx.shadowBlur = blur;
            ctx.strokeStyle = p.fgColor;
            ctx.lineWidth = Math.max(0.5, cell * p.wireWidth * 0.66);
            ctx.stroke(pads);
        }
    }
    ctx.restore();
}

function addPad(path, style, x, y, r) {
    if (style === 'square') {
        path.rect(x - r, y - r, r * 2, r * 2);
    } else {
        path.moveTo(x + r, y);
        path.arc(x, y, r, 0, Math.PI * 2);
    }
}

const FLOW_BUCKETS = 8;

// Draw the flow field as seen by the traces: one glyph per trace cell
export function renderFlow(ctx, flow, geom, color = '255, 138, 92') {
    if (!flow.geom) return;
    const { cols, rows } = geom;
    const map = flow.sampler(geom);
    const data = flow.data;
    const half = geom.cell * 0.4;
    const diag = half * Math.SQRT1_2;
    const paths = Array.from({ length: FLOW_BUCKETS }, () => new Path2D());

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const base = map[y * cols + x];
            if (base < 0 || !(data[base] | data[base + 1] | data[base + 2] | data[base + 3])) continue;
            const px = cx(geom, x), py = cy(geom, y);
            for (let a = 0; a < 4; a++) {
                const s = data[base + a];
                if (!s) continue;
                const path = paths[Math.min(FLOW_BUCKETS - 1, (s * FLOW_BUCKETS) >> 8)];
                if (a === 0) { path.moveTo(px, py - half); path.lineTo(px, py + half); }
                else if (a === 1) { path.moveTo(px - half, py); path.lineTo(px + half, py); }
                else if (a === 2) { path.moveTo(px - diag, py - diag); path.lineTo(px + diag, py + diag); }
                else { path.moveTo(px - diag, py + diag); path.lineTo(px + diag, py - diag); }
            }
        }
    }

    ctx.save();
    ctx.lineCap = 'round';
    for (let b = 0; b < FLOW_BUCKETS; b++) {
        const t = (b + 1) / FLOW_BUCKETS;
        ctx.strokeStyle = `rgba(${color}, ${0.15 + t * 0.75})`;
        ctx.lineWidth = Math.max(1, geom.cell * 0.08) + t * Math.max(1.5, geom.cell * 0.18);
        ctx.stroke(paths[b]);
    }
    ctx.restore();
}

export function renderGrid(ctx, geom) {
    const { width, height, cols, rows, cell, ox, oy } = geom;
    ctx.save();
    ctx.strokeStyle = 'rgba(230, 230, 230, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) {
        const x = Math.round(ox + i * cell) + 0.5;
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    for (let j = 0; j <= rows; j++) {
        const y = Math.round(oy + j * cell) + 0.5;
        ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
}

const fmt = (n) => +n.toFixed(2);

export function renderSVG(wires, geom, p, { transparent = false } = {}) {
    const { width, height, cell } = geom;
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
    if (p.glow > 0) {
        out.push(`<defs><filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${fmt(p.glow * cell * 0.75)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`);
    }
    if (!transparent) out.push(`<rect width="100%" height="100%" fill="${p.bgColor}"/>`);
    out.push(`<g${p.glow > 0 ? ' filter="url(#glow)"' : ''}>`);

    let d = '';
    for (const w of wires) {
        d += `M${fmt(cx(geom, w[0]))} ${fmt(cy(geom, w[1]))}`;
        for (let i = 2; i < w.length; i += 2) d += `L${fmt(cx(geom, w[i]))} ${fmt(cy(geom, w[i + 1]))}`;
    }
    out.push(`<path d="${d}" fill="none" stroke="${p.fgColor}" stroke-width="${fmt(Math.max(0.5, cell * p.wireWidth))}" stroke-linecap="round" stroke-linejoin="round"/>`);

    if (p.padStyle !== 'none') {
        const r = cell * p.padSize;
        let pads = '';
        for (const w of wires) {
            const n = w.length / 2;
            pads += padSVG(p.padStyle, cx(geom, w[0]), cy(geom, w[1]), r);
            if (n > 1) pads += padSVG(p.padStyle, cx(geom, w[n * 2 - 2]), cy(geom, w[n * 2 - 1]), r);
        }
        if (p.padStyle === 'dot') {
            out.push(`<path d="${pads}" fill="${p.fgColor}"/>`);
        } else {
            out.push(`<path d="${pads}" fill="${p.padColor}" stroke="${p.fgColor}" stroke-width="${fmt(Math.max(0.5, cell * p.wireWidth * 0.66))}"/>`);
        }
    }
    out.push('</g></svg>');
    return out.join('\n');
}

function padSVG(style, x, y, r) {
    if (style === 'square') return `M${fmt(x - r)} ${fmt(y - r)}h${fmt(r * 2)}v${fmt(r * 2)}h${fmt(-r * 2)}z`;
    return `M${fmt(x - r)} ${fmt(y)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(r * 2)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-r * 2)} 0z`;
}
