// ===============================================
// Flow painting with pointer input (mouse, touch and pen)
// ===============================================
import { angleToAxis } from './flowGrid.js';

const TWO_PI = Math.PI * 2;
const START_THRESHOLD = 4; // px of movement before a brush stroke picks a direction

// Probabilistic rounding keeps very soft brushes from rounding down to nothing
const dither = (v) => Math.floor(v + Math.random());

export function createPainter({ canvas, flow, params, getCellSize, onStrokeStart, onStroke, onStrokeEnd, onCancel, onOverlay }) {
    let stroke = null;
    let hover = null;

    // Brush size is expressed in trace cells so the cursor matches the board
    function radiusPx() { return params.brushSize * getCellSize(); }

    function spacingPx() { return Math.max(flow.geom.cell * 0.5, radiusPx() * 0.2); }

    function stamp(px, py, axis, erase, spacing, pressure) {
        const g = flow.geom;
        const R = (radiusPx() + getCellSize() * 0.5) / g.cell;
        const gx = (px - g.ox) / g.cell - 0.5;
        const gy = (py - g.oy) / g.cell - 0.5;
        const scale = params.brushOpacity * 255 * Math.min(1, spacing / (R * g.cell)) * pressure * (erase ? 2 : 1);
        const x0 = Math.max(0, Math.floor(gx - R)), x1 = Math.min(g.cols - 1, Math.ceil(gx + R));
        const y0 = Math.max(0, Math.floor(gy - R)), y1 = Math.min(g.rows - 1, Math.ceil(gy + R));
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const d = Math.hypot(x - gx, y - gy);
                if (d >= R) continue;
                let f = 1 - d / R;
                f = f * f * (3 - 2 * f);
                const amount = dither(scale * f);
                if (amount <= 0) continue;
                if (erase) flow.sub(x, y, amount);
                else flow.add(x, y, axis, amount);
            }
        }
    }

    // Stamp evenly along a segment so fast strokes leave no gaps
    function stampSegment(ax, ay, bx, by, axis, erase, pressure) {
        const spacing = spacingPx();
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.ceil(len / spacing));
        for (let i = 1; i <= n; i++) {
            const t = i / n;
            stamp(ax + (bx - ax) * t, ay + (by - ay) * t, axis, erase, spacing, pressure);
        }
    }

    function pos(e) {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function pressureOf(e) {
        return e.pointerType === 'pen' && e.pressure > 0 ? Math.min(1.5, e.pressure * 1.5) : 1;
    }

    function snap45(ax, ay, bx, by) {
        const len = Math.hypot(bx - ax, by - ay);
        const angle = Math.round(Math.atan2(by - ay, bx - ax) / (Math.PI / 4)) * (Math.PI / 4);
        return { x: ax + Math.cos(angle) * len, y: ay + Math.sin(angle) * len, angle };
    }

    function emitOverlay() {
        onOverlay({
            hover,
            radius: radiusPx(),
            tool: stroke ? stroke.tool : params.tool,
            line: stroke && stroke.tool === 'line' ? { x0: stroke.x0, y0: stroke.y0, x1: stroke.x1, y1: stroke.y1 } : null,
        });
    }

    function down(e) {
        if (!e.isPrimary || stroke) return;
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault();
        // Hand keyboard shortcuts back to the canvas after using the panel
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        const p = pos(e);
        let tool = params.tool;
        if (e.button === 2 || e.altKey) tool = 'eraser';
        canvas.setPointerCapture(e.pointerId);
        stroke = {
            id: e.pointerId, tool,
            x0: p.x, y0: p.y, x1: p.x, y1: p.y,
            lastX: p.x, lastY: p.y,
            angle: null, started: false,
        };
        hover = p;
        onStrokeStart();
        if (tool === 'eraser') {
            stroke.started = true;
            stamp(p.x, p.y, 0, true, spacingPx() * 2, pressureOf(e));
            onStroke();
        }
        emitOverlay();
    }

    function move(e) {
        const p = pos(e);
        hover = p;
        if (!stroke || e.pointerId !== stroke.id) {
            emitOverlay();
            return;
        }
        // Use coalesced events for smoother strokes where supported
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        for (const ev of (events.length ? events : [e])) moveTo(pos(ev), pressureOf(ev));
        emitOverlay();
    }

    function moveTo(p, pressure) {
        const s = stroke;
        if (s.tool === 'line') {
            const snapped = snap45(s.x0, s.y0, p.x, p.y);
            s.x1 = snapped.x; s.y1 = snapped.y; s.angle = snapped.angle;
            return;
        }
        if (s.tool === 'eraser') {
            stampSegment(s.lastX, s.lastY, p.x, p.y, 0, true, pressure);
            s.lastX = p.x; s.lastY = p.y;
            onStroke();
            return;
        }
        const dx = p.x - s.lastX, dy = p.y - s.lastY;
        if (!s.started && Math.hypot(dx, dy) < START_THRESHOLD) return;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

        const a = (Math.atan2(dy, dx) + TWO_PI) % TWO_PI;
        if (s.angle === null) s.angle = a;
        else {
            let diff = a - s.angle;
            if (diff > Math.PI) diff -= TWO_PI;
            if (diff < -Math.PI) diff += TWO_PI;
            s.angle = (s.angle + diff * params.angleSmoothing + TWO_PI) % TWO_PI;
        }
        stampSegment(s.lastX, s.lastY, p.x, p.y, angleToAxis(s.angle), false, pressure);
        s.started = true;
        s.lastX = p.x; s.lastY = p.y;
        onStroke();
    }

    function up(e) {
        if (!stroke || e.pointerId !== stroke.id) return;
        const s = stroke;
        if (s.tool === 'line' && s.angle !== null && Math.hypot(s.x1 - s.x0, s.y1 - s.y0) > 2) {
            // A line stamps a full-strength pass along its length
            stamp(s.x0, s.y0, angleToAxis(s.angle), false, spacingPx(), 1);
            stampSegment(s.x0, s.y0, s.x1, s.y1, angleToAxis(s.angle), false, 1);
            s.started = true;
        }
        stroke = null;
        if (e.type === 'pointercancel') onCancel();
        else onStrokeEnd(s.started);
        emitOverlay();
    }

    function leave(e) {
        if (e.pointerType !== 'mouse' || stroke) return;
        hover = null;
        emitOverlay();
    }

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    return {
        get active() { return !!stroke; },
        // Abort the current stroke (e.g. on Escape); the caller restores state
        cancel() {
            if (!stroke) return false;
            try { canvas.releasePointerCapture(stroke.id); } catch { /* already released */ }
            stroke = null;
            onCancel();
            emitOverlay();
            return true;
        },
        refreshOverlay: emitOverlay,
    };
}
