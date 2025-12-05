// ===============================================
// Mouse angle & painting
// ===============================================
import { params } from './params.js';
import { mapDirection8ToFlow4, addFlowStrength, subFlowStrength } from './flowGrid.js';
import { getCanvas, redraw } from './canvas.js';

let mouseAngle = null; // Current smoothed angle
let lastMouseX = null;
let lastMouseY = null;
let isPainting = false;
let gridWidth, gridHeight;

export function setGridDimensionsForMouse(w, h) {
    gridWidth = w;
    gridHeight = h;
}

// Apply soft brush to cells at given position
function applyBrush(px, py, flowDir) {
    const canvas = getCanvas();
    const sx = (1 + canvas.width / params.cellSize) / gridWidth;
    const sy = (1 + canvas.height / params.cellSize) / gridHeight;
    const cw = params.cellSize * sx;
    const ch = params.cellSize * sy;
    
    let centerGx = px / cw;
    let centerGy = py / ch;
    
    // Apply brush to all cells within radius with soft falloff
    let radius = params.brushSize;
    let radiusSq = radius * radius;
    
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            let distSq = dx * dx + dy * dy;
            if (distSq > radiusSq) continue;
            
            let gx = Math.floor(centerGx + dx);
            let gy = Math.floor(centerGy + dy);
            
            if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight) {
                // Soft falloff: smooth curve from center to edge
                let dist = Math.sqrt(distSq);
                let falloff = dist > 0 ? 1 - (dist / radius) : 1;
                // Apply smooth curve (ease-out)
                falloff = falloff * falloff * (3 - 2 * falloff);
                
                // Convert opacity from 0-1 range to 0-255 range for flow strength
                let amount = Math.floor(params.brushOpacity * falloff * 255);
                if (amount > 0) {
                    if (params.brushMode === 'brush') {
                        addFlowStrength(gx, gy, flowDir, amount);
                    } else {
                        subFlowStrength(gx, gy, flowDir, amount);
                    }
                }
            }
        }
    }
}

function getMousePos(e) {
    const canvas = getCanvas();
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

let recreateCallback = null;
export function setRecreateCallback(callback) {
    recreateCallback = callback;
}

export function handleMouseDown(e) {
    // Don't paint if clicking on GUI elements
    let elementAtClick = e.target;
    
    // Check if clicking on dat.GUI element (dat.GUI uses 'dg' class prefix)
    if (elementAtClick && (elementAtClick.closest('.dg') || elementAtClick.classList.contains('dg'))) {
        return; // Don't paint if clicking on dat.GUI
    }
    
    const canvas = getCanvas();
    // Only paint if clicking directly on the canvas element
    if (params.paintFlow && elementAtClick === canvas) {
        const pos = getMousePos(e);
        if (pos.x > 0 && pos.x < canvas.width && pos.y > 0 && pos.y < canvas.height) {
            isPainting = true;
            mouseAngle = null; // Reset angle on new press
            lastMouseX = pos.x;
            lastMouseY = pos.y;
            
            // Apply brush on initial click (default to horizontal direction)
            applyBrush(pos.x, pos.y, 1);
            redraw();
        }
    }
}

export function handleMouseMove(e) {
    if (!isPainting || !params.paintFlow) {
        // Still update last position even if not painting
        const pos = getMousePos(e);
        lastMouseX = pos.x;
        lastMouseY = pos.y;
        return;
    }

    const pos = getMousePos(e);
    
    // Calculate new angle from mouse movement
    let dx = pos.x - lastMouseX;
    let dy = pos.y - lastMouseY;
    
    // Only update if there's significant movement
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        const TWO_PI = Math.PI * 2;
        let newMouseAngle = (Math.atan2(dy, dx) + TWO_PI) % TWO_PI;
        
        // Initialize mouseAngle on first move
        if (mouseAngle === null) {
            mouseAngle = newMouseAngle;
        } else {
            // Handle angle wrapping (shortest path around circle)
            let diff = newMouseAngle - mouseAngle;
            if (diff > Math.PI) diff -= TWO_PI;
            if (diff < -Math.PI) diff += TWO_PI;
            
            // Ease towards new angle (smooth interpolation)
            mouseAngle = (mouseAngle + diff * params.angleSmoothing + TWO_PI) % TWO_PI;
        }
        
        // Convert smoothed angle to flow direction
        // atan2 gives: 0=right, PI/2=down, PI=left, 3*PI/2=up
        // dirs array: 0=TL(-3PI/4), 1=up(-PI/2), 2=TR(-PI/4), 3=right(0), 4=BR(PI/4), 5=down(PI/2), 6=BL(3PI/4), 7=left(PI)
        // Map atan2 angle to dirs index: shift by 3 positions since dirs starts at -3PI/4
        let direction8Index = (Math.round(mouseAngle / (TWO_PI / 8)) + 3) % 8;
        let flowDir = mapDirection8ToFlow4(direction8Index);
        
        applyBrush(pos.x, pos.y, flowDir);
        redraw(); // live preview
    }
    
    lastMouseX = pos.x;
    lastMouseY = pos.y;
}

export function handleMouseUp(e) {
    if (isPainting && params.autoRegenerate && recreateCallback) {
        recreateCallback(); // Regenerate wires to follow the painted flow
    }
    isPainting = false;
    mouseAngle = null;
    lastMouseX = null;
    lastMouseY = null;
}

