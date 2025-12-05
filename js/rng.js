// ===============================================
// SEEDED RNG — safe, local, no global changes
// ===============================================
let rng;

export function setSeed(s = "circuit42") {
    rng = new Math.seedrandom(s);
}

export function rnd() { 
    return rng(); 
}

export function rndInt(n) { 
    return Math.floor(rnd() * n); 
}

