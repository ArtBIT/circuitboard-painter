// ===============================================
// localStorage that never throws (private mode, blocked storage, quota)
// ===============================================
export const store = {
    get(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
        try {
            if (value === '' || value == null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch { /* storage unavailable */ }
    },
};
