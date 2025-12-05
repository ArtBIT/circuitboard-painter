// ===============================================
// Color conversion utilities (for dat.GUI compatibility)
// ===============================================
export function rgbaToHex(rgba) {
    // Extract r, g, b from rgba string
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return '#000000';
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    return "#" + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    }).join("");
}

export function hexToRgba(hex, alpha = 1) {
    // Convert hex color to rgba string
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return 'rgba(0, 0, 0, 1)';
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ===============================================
// Sketch variables
// ===============================================
export var params = {
    cellSize: 10,
    wireLength: 14,
    cutOffLength: 2,
    straightness: 7,
    showGrid: false,
    seed: 1,
    bgColor: 'rgba(51, 5, 51, 1)',   // Converted from HSB(275, 90, 20)
    fgColor: 'rgba(163, 204, 194, 1)', // Converted from HSB(169, 20, 80)
    
    // === FLOW GRID CONTROLS ===
    paintFlow: true,
    brushSize: 3,           // brush radius in cells
    brushOpacity: 0.5,     // 0 to 1
    brushMode: 'brush',     // 'brush' or 'eraser'
    angleSmoothing: 0.3,    // 0-1, higher = smoother but slower response
    flowInfluence: 1.0,    // 0-1, how much wires follow flow (1.0 = 100%)
    autoRegenerate: true,  // automatically regenerate wires after painting
    showFlowGrid: true,
    clearFlowGrid: function() { 
        // Will be set by main.js after flowGrid module is loaded
    },
    
    regenerate: function() { 
        // Will be set by main.js
    },
    savePNG: function() { 
        // Will be set by main.js after canvas is initialized
    }
};

