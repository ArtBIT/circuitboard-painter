// ===============================================
// Wire generation
// ===============================================
import { setSeed, rnd, rndInt } from './rng.js';
import { mapDirection8ToFlow4 } from './flowGrid.js';

// 0:TL 1:up 2:TR 3:right 4:BR 5:down 6:BL 7:left
const DIRS = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

// Flow may steer a wire at most 90 degrees per step; sharper turns look broken
const MAX_FLOW_TURN = 2;

/**
 * Generate wires on the grid described by `geom`.
 * Returns an array of wires; each wire is a flat array [x0, y0, x1, y1, ...]
 * in cell coordinates. Wires shorter than cutOffLength are dropped (but still
 * occupy their cells, so the layout does not shift when the cut off changes).
 */
export function generateWires(p, geom, flow) {
    setSeed(p.seed);
    const { cols, rows } = geom;
    const avail = new Uint8Array(cols * rows);
    const inside = (x, y) => x > 0 && x < cols - 1 && y > 0 && y < rows - 1;

    // Interior cells in random order (Fisher-Yates)
    const order = [];
    for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
            const i = y * cols + x;
            avail[i] = 1;
            order.push(i);
        }
    }
    for (let i = order.length - 1; i > 0; i--) {
        const j = rndInt(i + 1);
        const t = order[i]; order[i] = order[j]; order[j] = t;
    }

    const isFree = (x, y) => avail[y * cols + x] === 1;

    // A diagonal step must not cut through another wire's diagonal
    function validDiagonal(dir, x, y) {
        if (dir === 0) return isFree(x + 1, y) || isFree(x, y + 1);
        if (dir === 2) return isFree(x - 1, y) || isFree(x, y + 1);
        if (dir === 4) return isFree(x - 1, y) || isFree(x, y - 1);
        if (dir === 6) return isFree(x + 1, y) || isFree(x, y - 1);
        return true;
    }

    function randomOpenDirection(x, y) {
        const first = rndInt(8);
        const step = rnd() < 0.5 ? 1 : 7;
        for (let k = 0; k < 8; k++) {
            const d = (first + k * step) % 8;
            const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
            if (inside(nx, ny) && isFree(nx, ny)) return d;
        }
        return first;
    }

    const hasFlow = flow && p.flowInfluence > 0 && !flow.isEmpty();
    const flowMap = hasFlow ? flow.sampler(geom) : null;
    const flowData = hasFlow ? flow.data : null;
    const biases = new Array(8);
    const wires = [];

    for (const start of order) {
        if (!avail[start]) continue;
        if (p.density < 1 && rnd() > p.density) continue;
        avail[start] = 0;

        let x = start % cols, y = (start / cols) | 0;
        const cells = [x, y];
        // `last` points backwards: the next step goes towards last + 4 (+ turn)
        let last = (randomOpenDirection(x, y) + 4) % 8;

        while (cells.length / 2 < p.wireLength) {
            const modifiers = rnd() > 0.5 ? [0, 1, -1] : [0, -1, 1];

            let totalBias = 0;
            const base = hasFlow ? flowMap[y * cols + x] : -1;
            if (base >= 0) {
                for (let i = 0; i < 8; i++) {
                    const turn = i - 4;
                    const s = Math.abs(turn) <= MAX_FLOW_TURN
                        ? flowData[base + mapDirection8ToFlow4(last + 4 + turn)]
                        : 0;
                    biases[i] = s;
                    totalBias += s;
                }
            }

            let found = false;
            let attempts = 0;
            while (modifiers.length && !found && attempts++ < 50) {
                let turn = null;
                if (totalBias > 0 && rnd() < p.flowInfluence) {
                    // Weighted pick, removing the choice so it is not retried
                    let r = rndInt(totalBias);
                    for (let i = 0; i < 8; i++) {
                        if (r < biases[i]) {
                            turn = i - 4;
                            totalBias -= biases[i];
                            biases[i] = 0;
                            break;
                        }
                        r -= biases[i];
                    }
                }
                if (turn === null) {
                    const k = Math.floor(Math.pow(rnd(), p.straightness) * modifiers.length);
                    turn = modifiers.splice(k, 1)[0];
                }

                const dir = (last + 4 + turn + 8) % 8;
                const nx = x + DIRS[dir][0], ny = y + DIRS[dir][1];
                if (inside(nx, ny) && isFree(nx, ny) && validDiagonal(dir, nx, ny)) {
                    avail[ny * cols + nx] = 0;
                    cells.push(nx, ny);
                    x = nx; y = ny;
                    last = (last + turn + 8) % 8;
                    found = true;
                }
            }
            if (!found) break;
        }

        if (cells.length / 2 > p.cutOffLength) wires.push(cells);
    }

    return wires;
}
