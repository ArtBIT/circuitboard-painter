// ===============================================
// Initialization and orchestration
// ===============================================
import { setSeed, rndInt } from './rng.js';
import { params, rgbaToHex, hexToRgba } from './params.js';
import { initFlowGrid, resetFlowGrid } from './flowGrid.js';
import { Cell, Wire } from './wire.js';
import { initCanvas, getCanvas, getCtx, setWires, setGridDimensions, redraw, resize } from './canvas.js';
import { handleMouseDown, handleMouseMove, handleMouseUp, setRecreateCallback, setGridDimensionsForMouse } from './mouse.js';

var grid = [], wires = [], available = [];
var gridWidth, gridHeight;

// ===============================================
// Regenerate everything
// ===============================================
function recreate() {
    setSeed(params.seed);
    const canvas = getCanvas();

    let oldGridWidth = gridWidth;
    let oldGridHeight = gridHeight;
    
    gridWidth  = Math.ceil(canvas.width  / params.cellSize) + 1;
    gridHeight = Math.ceil(canvas.height / params.cellSize) + 1;

    grid = []; available = []; wires = [];

    for (let x = 0; x < gridWidth; x++) {
        grid[x] = [];
        for (let y = 0; y < gridHeight; y++) {
            let cell = new Cell(x, y);
            grid[x][y] = cell;
            available.push(cell);
        }
    }

    // Only preserve flow grid if dimensions haven't changed and it exists
    // This ensures deterministic behavior when just clicking fields
    if (oldGridWidth === gridWidth && oldGridHeight === gridHeight) {
        initFlowGrid(gridWidth, gridHeight); // resize flow grid if needed, preserving values
    } else {
        // Grid size changed or first run, initialize flow grid to all zeros
        initFlowGrid(gridWidth, gridHeight);
        resetFlowGrid();
    }

    // Update grid dimensions in other modules
    setGridDimensions(gridWidth, gridHeight);
    setGridDimensionsForMouse(gridWidth, gridHeight);

    while (available.length) {
        let i = rndInt(available.length);
        let cell = available.splice(i, 1)[0];
        cell.available = false;

        let wire = new Wire(cell, grid, gridWidth, gridHeight);
        wire.generate();
        wires.push(wire);

        for (let c of wire.cells) {
            let pos = available.indexOf(c);
            if (pos !== -1) available.splice(pos, 1);
        }
    }
    
    setWires(wires);
    redraw();
}

// ===============================================
// Initialization
// ===============================================
function setup() {
    // Initialize canvas
    initCanvas();
    const canvas = getCanvas();
    const ctx = getCtx();
    
    // Set up params callbacks
    params.clearFlowGrid = function() { 
        resetFlowGrid(); 
        redraw(); 
    };
    
    params.regenerate = function() { 
        recreate(); 
    };
    
    params.savePNG = function() { 
        const link = document.createElement('a');
        link.download = `circuit_${params.seed}_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    // Set up mouse recreate callback
    setRecreateCallback(recreate);

    // Setup dat.GUI
    let gui = new dat.GUI();

    let flowFolder = gui.addFolder('Flow Field Painting');
    flowFolder.add(params, 'paintFlow').name('Enable Painting');
    flowFolder.add(params, 'brushMode', ['brush', 'eraser']).name('Tool');
    flowFolder.add(params, 'brushSize', 1, 20, 1).name('Brush Size');
    flowFolder.add(params, 'brushOpacity', 0, 1, 0.01).name('Opacity');
    flowFolder.add(params, 'angleSmoothing', 0.1, 1, 0.05).name('Angle Smoothing');
    flowFolder.add(params, 'flowInfluence', 0, 1, 0.05).name('Flow Influence');
    flowFolder.add(params, 'autoRegenerate').name('Auto Regenerate');
    flowFolder.add(params, 'showFlowGrid').name('Show Flow Field').onChange(() => { redraw(); });
    flowFolder.add(params, 'clearFlowGrid').name('Clear Flow Grid');
    flowFolder.open();

    // Every controller automatically regenerates on change
    gui.add(params, "cellSize", 5, 80, 1).onChange(recreate);
    gui.add(params, "wireLength", 1, 100, 1).onChange(recreate);
    gui.add(params, "cutOffLength", 0, 10, 1).onChange(recreate);
    gui.add(params, "straightness", 0.01, 20, 0.01).onChange(recreate);
    gui.add(params, "showGrid").name("Show Grid").onChange(() => { redraw(); });
    gui.add(params, "seed", 0, 10000, 1).name("Seed").onChange(recreate);
    
    // Setup color pickers with getters/setters for dat.GUI compatibility
    Object.defineProperty(params, 'bgColorHex', {
        get: function() { return rgbaToHex(params.bgColor); },
        set: function(hex) { 
            params.bgColor = hexToRgba(hex);
            redraw();
        }
    });
    Object.defineProperty(params, 'fgColorHex', {
        get: function() { return rgbaToHex(params.fgColor); },
        set: function(hex) { 
            params.fgColor = hexToRgba(hex);
            redraw();
        }
    });
    
    gui.addColor(params, "bgColorHex").name("Background Color");
    gui.addColor(params, "fgColorHex").name("Foreground Color");
    gui.add(params, "savePNG").name("Save PNG");

    // Add mouse event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp); // Stop painting if mouse leaves canvas
    
    // Add window resize listener
    window.addEventListener('resize', () => {
        resize();
        recreate();
    });
    
    recreate();
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
} else {
    setup();
}

