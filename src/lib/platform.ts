export const isMac = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
export const commandKey = isMac ? "⌘" : "Ctrl";
