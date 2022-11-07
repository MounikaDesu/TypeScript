const { join, resolve, dirname } = require("path") as typeof import("path");
const { existsSync } = require("fs") as typeof import("fs");

// search directories upward to avoid hard-wired paths based on the
// build tree (same as scripts/build/findUpDir.js)

export function findUpFile(name: string): string {
    let dir = __dirname;
    while (true) {
        const fullPath = join(dir, name);
        if (existsSync(fullPath)) return fullPath;
        const up = resolve(dir, "..");
        if (up === dir) return name; // it'll fail anyway
        dir = up;
    }
}

export const findUpRoot: { (): string; cached?: string; } = () =>
    findUpRoot.cached ||= dirname(findUpFile("Gulpfile.mjs"));
