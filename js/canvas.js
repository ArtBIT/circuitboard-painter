// ===============================================
// Canvas setup
// ===============================================
import { params } from './params.js';
import { drawFlowOverlay } from './flowGrid.js';

let canvas, ctx;
let width, height;
let shouldLoop = false;
let animationFrameId = null;
let wires = [];
let gridWidth, gridHeight;

export function getCanvas() { return canvas; }
export function getCtx() { return ctx; }
export function setWires(w) { wires = w; }
export function setGridDimensions(w, h) { gridWidth = w; gridHeight = h; }

export function initCanvas() {
    // Create canvas element
    canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '0';
    document.body.appendChild(canvas);
    
    ctx = canvas.getContext('2d');
    
    // Set initial size
    resize();
}

function drawGridOverlay() {
    if (!params.showGrid) return;
    const sx = (1 + canvas.width / params.cellSize) / gridWidth;
    const sy = (1 + canvas.height / params.cellSize) / gridHeight;
    const cw = params.cellSize * sx;
    const ch = params.cellSize * sy;

    ctx.strokeStyle = 'rgba(230, 230, 230, 0.15)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'transparent';
    
    ctx.beginPath();
    for (let i = 0; i <= gridWidth; i++) {
        ctx.moveTo(i * cw, 0);
        ctx.lineTo(i * cw, canvas.height);
    }
    for (let j = 0; j <= gridHeight; j++) {
        ctx.moveTo(0, j * ch);
        ctx.lineTo(canvas.width, j * ch);
    }
    ctx.stroke();
}

export function draw() {
    // Clear canvas with background color
    ctx.fillStyle = params.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!wires.length) return;

    for (let w of wires)
        if (w.cells.length > params.cutOffLength) w.render(canvas, ctx);

    drawFlowOverlay(canvas, ctx, params);
    drawGridOverlay();
}

export function redraw() {
    draw();
}

export function loop() {
    shouldLoop = true;
    function animate() {
        if (shouldLoop) {
            draw();
            animationFrameId = requestAnimationFrame(animate);
        }
    }
    animate();
}

export function noLoop() {
    shouldLoop = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

export function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    width = canvas.width;
    height = canvas.height;
    return { width, height };
}

