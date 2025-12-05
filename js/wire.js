// ===============================================
// Core objects
// ===============================================
import { rnd, rndInt } from './rng.js';
import { mapDirection8ToFlow4, getFlowStrength } from './flowGrid.js';
import { params } from './params.js';

const dirs = [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]];

export function Cell(x, y) { 
    this.x = x; 
    this.y = y; 
    this.available = true; 
}

export function Wire(start, grid, gridWidth, gridHeight) {
    this.cells = [start];
    this.last = findRandomAvailableDirection(start.x, start.y, grid, gridWidth, gridHeight);
    this.grid = grid;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
}

Wire.prototype.render = function(canvas, ctx) {
    const sx = (1 + canvas.width / params.cellSize) / this.gridWidth;
    const sy = (1 + canvas.height / params.cellSize) / this.gridHeight;
    const cw = params.cellSize * sx;
    const ch = params.cellSize * sy;
    const r = params.cellSize / 4;

    // Draw wire path
    ctx.beginPath();
    ctx.strokeStyle = params.fgColor;
    ctx.lineWidth = params.cellSize / 4;
    ctx.fillStyle = 'transparent';
    for (let i = 0; i < this.cells.length; i++) {
        const c = this.cells[i];
        const x = (c.x + 0.5) * cw;
        const y = (c.y + 0.5) * ch;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();

    // Draw endpoints (circles at start and end of wire)
    ctx.fillStyle = params.bgColor;
    ctx.strokeStyle = params.fgColor;
    ctx.lineWidth = params.cellSize / 6;
    
    // Start point
    const startX = (this.cells[0].x + 0.5) * cw;
    const startY = (this.cells[0].y + 0.5) * ch;
    ctx.beginPath();
    ctx.arc(startX, startY, r, 0, Math.PI * 2, false);
    ctx.fill();
    ctx.stroke();
    
    // End point  
    const endX = (this.cells[this.cells.length-1].x + 0.5) * cw;
    const endY = (this.cells[this.cells.length-1].y + 0.5) * ch;
    ctx.beginPath();
    ctx.arc(endX, endY, r, 0, Math.PI * 2, false);
    ctx.fill();
    ctx.stroke();
};

// Get flow direction choice based on flow grid biases
function getFlowDirection(currentCell, lastDirection, flowBiases, totalFlowBias, attemptedFlowChoices) {
    // Check if there's flow to follow
    if (totalFlowBias === 0) {
        return null;
    }
    
    // Try to follow flow, but avoid already-tried invalid directions
    let validFlowBiases = [];
    let validDirectionChoices = [];
    let validFlowBiasTotal = 0;
    
    for (let directionIndex = 0; directionIndex < 8; directionIndex++) {
        let directionModifier = directionIndex - 4;
        let choiceKey = directionModifier.toString();
        
        // Only consider directions we haven't tried yet
        if (!attemptedFlowChoices.has(choiceKey)) {
            validFlowBiases.push(flowBiases[directionIndex]);
            validDirectionChoices.push(directionModifier);
            validFlowBiasTotal += flowBiases[directionIndex];
        }
    }
    
    // If we've tried all flow directions, return null
    if (validFlowBiasTotal === 0) {
        return null;
    }
    
    // Pick from valid flow directions using weighted random selection
    let randomValue = rndInt(validFlowBiasTotal);
    let cumulativeSum = 0;
    for (let i = 0; i < validDirectionChoices.length; i++) {
        cumulativeSum += validFlowBiases[i];
        if (randomValue < cumulativeSum) {
            let directionChoice = validDirectionChoices[i];
            attemptedFlowChoices.add(directionChoice.toString());
            return directionChoice;
        }
    }
    
    return null; // Fallback (shouldn't reach here)
}

Wire.prototype.generate = function() {
    while (this.cells.length < params.wireLength) {
        let currentCell = this.cells[this.cells.length - 1];
        let directionModifiers = rnd() > 0.5 ? [0,1,-1] : [0,-1,1];
        let foundValidCell = false;
        let attempts = 0;
        const maxAttempts = 50; // Safety limit to prevent infinite loops

        // === BIAS FROM FLOW GRID ===
        // Get flow strength for each of the 8 directions, mapped to 4 flow types
        let totalFlowBias = 0;
        let flowBiases = [];
        for (let directionIndex = 0; directionIndex < 8; directionIndex++) {
            let relativeDirection = (this.last + directionIndex + 4 + 8) % 8; // relative to last direction
            let flowDirection = mapDirection8ToFlow4(relativeDirection);
            let flowStrength = getFlowStrength(currentCell.x, currentCell.y, flowDirection);
            totalFlowBias += flowStrength;
            flowBiases.push(flowStrength);
        }

        // Track attempted flow directions to avoid infinite loops
        let attemptedFlowChoices = new Set();

        while (directionModifiers.length && !foundValidCell && attempts < maxAttempts) {
            attempts++;
            let directionChoice;
            let shouldUseFlow = totalFlowBias > 0 && rnd() < params.flowInfluence;
            
            if (shouldUseFlow) {
                directionChoice = getFlowDirection(currentCell, this.last, flowBiases, totalFlowBias, attemptedFlowChoices);
                if (directionChoice === null) {
                    shouldUseFlow = false;
                }
            }
            
            if (!shouldUseFlow) {
                // Fall back to normal direction selection
                let directionModifier = directionModifiers.splice(Math.floor(Math.pow(rnd(), params.straightness) * directionModifiers.length), 1)[0];
                directionChoice = directionModifier;
            }

            let directionIndex = (this.last + 4 + directionChoice + 8) % 8;
            let [dx, dy] = dirs[directionIndex];
            let nextX = currentCell.x + dx, nextY = currentCell.y + dy;

            if (nextX > 0 && nextX < this.gridWidth-1 && nextY > 0 && nextY < this.gridHeight-1) {
                let nextCell = this.grid[nextX][nextY];
                if (nextCell.available && isValidDiagonalMove(directionIndex, nextX, nextY, this.grid)) {
                    this.cells.push(nextCell);
                    nextCell.available = false;
                    foundValidCell = true;
                    this.last = (this.last + directionChoice + 8) % 8;
                }
            }
        }
        if (!foundValidCell) break;
    }
};

function isValidDiagonalMove(directionIndex, x, y, grid) {
    // Check if diagonal move won't create a crossover by ensuring adjacent cells are available
    if (directionIndex === 0) return grid[x+1][y].available || grid[x][y+1].available; // top-left diagonal
    if (directionIndex === 2) return grid[x-1][y].available || grid[x][y+1].available; // top-right diagonal
    if (directionIndex === 4) return grid[x-1][y].available || grid[x][y-1].available; // bottom-right diagonal
    if (directionIndex === 6) return grid[x+1][y].available || grid[x][y-1].available; // bottom-left diagonal
    return true; // non-diagonal moves are always valid
}

function findRandomAvailableDirection(x, y, grid, gridWidth, gridHeight) {
    let availableDirections = [0,1,2,3,4,5,6,7];
    while (availableDirections.length) {
        let randomIndex = rndInt(availableDirections.length);
        let directionIndex = availableDirections.splice(randomIndex, 1)[0];
        let [dx, dy] = dirs[directionIndex];
        let nextX = x + dx, nextY = y + dy;
        if (nextX > 0 && nextX < gridWidth-1 && nextY > 0 && nextY < gridHeight-1 && grid[nextX][nextY].available)
            return directionIndex;
    }
    return 0;
}

