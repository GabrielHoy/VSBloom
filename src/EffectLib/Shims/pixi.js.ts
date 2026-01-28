/**
 * Pixi.JS Shim for VSBloom Effects
 * 
 * This file acts as a shim that re-exports Pixi.JS from the pre-loaded
 * shared libraries on window.__VSBLOOM__.libs. Effects import from
 * 'pixi.js' normally, and esbuild aliases resolve to this shim at build time.
 */

/// <reference lib="dom" />

const libs = (window as any).__VSBLOOM__?.libs;

if (!libs?.pixi) {
    throw new Error("[VSBloom]: Pixi.JS was not available, VSBloom's SharedLibraries may not have loaded correctly.");
}

export const pixi = libs.pixi;

//re-export types for TypeScript support
export type * from 'pixi.js';