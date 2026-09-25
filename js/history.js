// ===============================================
// Undo / redo stack of opaque snapshots
// ===============================================
export class History {
    constructor(limit = 60) {
        this.limit = limit;
        this.past = [];
        this.future = [];
    }

    // Record the state *before* a change
    push(snapshot) {
        this.past.push(snapshot);
        if (this.past.length > this.limit) this.past.shift();
        this.future.length = 0;
    }

    undo(current) {
        if (!this.past.length) return null;
        this.future.push(current);
        return this.past.pop();
    }

    redo(current) {
        if (!this.future.length) return null;
        this.past.push(current);
        return this.future.pop();
    }

    get canUndo() { return this.past.length > 0; }
    get canRedo() { return this.future.length > 0; }
}
