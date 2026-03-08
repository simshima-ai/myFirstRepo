import { sanitizeToolShortcuts, normalizeShortcutKey } from "./state.js";

export function isTypingTarget(target) {
    if (!target) return false;
    const el = target.nodeType === 1 ? target : target.parentElement;
    if (!el) return false;
    if (el.closest?.("input, textarea, select, [contenteditable='true']")) return true;
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    return false;
}

export function findShortcutAction(state, keyRaw) {
    const key = normalizeShortcutKey(keyRaw);
    if (!key) return null;
    const shortcuts = sanitizeToolShortcuts(state?.ui?.toolShortcuts);
    for (const [actionId, bound] of Object.entries(shortcuts)) {
        if (normalizeShortcutKey(bound) === key) return actionId;
    }
    return null;
}
