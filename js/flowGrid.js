// ===============================================
// FLOW GRID: 4 directions × 8 bits = 32 bits → one Uint32 per cell
// Directions: 0=vertical, 1=horizontal, 2=diagonal TL-BR, 3=diagonal BL-TR
// ===============================================
let flowGrid = []; // flowGrid[x][y] = Uint32
let gridWidth, gridHeight;

// Map 8-direction index to 4 flow types:
// 0=vertical (1,5), 1=horizontal (3,7), 2=diagonal TL-BR (0,4), 3=diagonal BL-TR (2,6)
export function mapDirection8ToFlow4(direction8Index) {
    // 0:[-1,-1]=TL, 1:[0,-1]=up, 2:[1,-1]=TR, 3:[1,0]=right, 4:[1,1]=BR, 5:[0,1]=down, 6:[-1,1]=BL, 7:[-1,0]=left
    if (direction8Index === 1 || direction8Index === 5) return 0; // vertical (up/down)
    if (direction8Index === 3 || direction8Index === 7) return 1; // horizontal (left/right)
    if (direction8Index === 0 || direction8Index === 4) return 2; // diagonal TL-BR
    if (direction8Index === 2 || direction8Index === 6) return 3; // diagonal BL-TR
    return 0; // default
}

export function initFlowGrid(width, height) {
    gridWidth = width;
    gridHeight = height;
    // Initialize or resize flow grid, preserving existing values
    let oldGrid = flowGrid;
    flowGrid = [];
    
    for (let x = 0; x < gridWidth; x++) {
        flowGrid[x] = [];
        for (let y = 0; y < gridHeight; y++) {
            // Preserve existing value if within old grid bounds, otherwise 0
            if (oldGrid[x] && oldGrid[x][y] !== undefined) {
                flowGrid[x][y] = oldGrid[x][y];
            } else {
                flowGrid[x][y] = 0;
            }
        }
    }
}

export function resetFlowGrid() {
    // Clear all flow grid values
    for (let x = 0; x < gridWidth; x++) {
        if (flowGrid[x]) {
            for (let y = 0; y < gridHeight; y++) {
                if (flowGrid[x][y] !== undefined) {
                    flowGrid[x][y] = 0;
                }
            }
        }
    }
}

// Get strength (0–255) of a specific flow direction (0-3)
export function getFlowStrength(x, y, flowDir) {
    if (!flowGrid[x] || flowGrid[x][y] === undefined) return 0;
    return (flowGrid[x][y] >> (flowDir * 8)) & 0xFF;
}

// Add strength to a flow direction (clamped 0–255)
export function addFlowStrength(x, y, flowDir, amount) {
    if (!flowGrid[x] || flowGrid[x][y] === undefined) flowGrid[x][y] = 0;
    let shift = flowDir * 8;
    let current = (flowGrid[x][y] >> shift) & 0xFF;
    let value = Math.min(255, current + amount);
    flowGrid[x][y] = (flowGrid[x][y] & ~(0xFF << shift)) | (value << shift);
}

// Subtract from a flow direction (clamped 0–255)
export function subFlowStrength(x, y, flowDir, amount) {
    if (!flowGrid[x] || flowGrid[x][y] === undefined) return;
    let shift = flowDir * 8;
    let current = (flowGrid[x][y] >> shift) & 0xFF;
    let value = Math.max(0, current - amount);
    flowGrid[x][y] = (flowGrid[x][y] & ~(0xFF << shift)) | (value << shift);
}

// Draw flow overlay on canvas
export function drawFlowOverlay(canvas, ctx, params) {
    if (!params.showFlowGrid) return;

    const sx = (1 + canvas.width / params.cellSize) / gridWidth;
    const sy = (1 + canvas.height / params.cellSize) / gridHeight;
    const cw = params.cellSize * sx;
    const ch = params.cellSize * sy;

    for (let x = 0; x < gridWidth; x++) {
        for (let y = 0; y < gridHeight; y++) {
            let value = flowGrid[x] && flowGrid[x][y] !== undefined ? flowGrid[x][y] : 0;
            if (value === 0) continue;

            let cx = (x + 0.5) * cw;
            let cy = (y + 0.5) * ch;
            let len = params.cellSize * 0.8;

            // Draw 4 flow directions as simple lines
            for (let flowDir = 0; flowDir < 4; flowDir++) {
                let strength = (value >> (flowDir * 8)) & 0xFF;
                if (strength === 0) continue;

                let opacity = strength / 255;
                ctx.strokeStyle = `rgba(204, 153, 153, ${opacity})`;
                ctx.lineWidth = strength / 255 * 3 + 0.5;

                ctx.beginPath();
                if (flowDir === 0) {
                    // Vertical line
                    ctx.moveTo(cx, cy - len/2);
                    ctx.lineTo(cx, cy + len/2);
                } else if (flowDir === 1) {
                    // Horizontal line
                    ctx.moveTo(cx - len/2, cy);
                    ctx.lineTo(cx + len/2, cy);
                } else if (flowDir === 2) {
                    // Diagonal TL-BR (top-left to bottom-right)
                    let offset = len / 2 * Math.sqrt(2) / 2;
                    ctx.moveTo(cx - offset, cy - offset);
                    ctx.lineTo(cx + offset, cy + offset);
                } else if (flowDir === 3) {
                    // Diagonal BL-TR (bottom-left to top-right)
                    let offset = len / 2 * Math.sqrt(2) / 2;
                    ctx.moveTo(cx - offset, cy + offset);
                    ctx.lineTo(cx + offset, cy - offset);
                }
                ctx.stroke();
            }
        }
    }
}

