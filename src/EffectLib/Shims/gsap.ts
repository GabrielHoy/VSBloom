/**
 * GSAP Shim for VSBloom Effects
 * 
 * This file acts as a shim that re-exports GSAP from the pre-loaded
 * shared libraries on window.__VSBLOOM__.libs. Effects import from
 * 'gsap' normally, and esbuild aliases resolve to this shim at build time.
 * 
 * This little 'hack' allows for idiomatic usage of GSAP in
 * effects, i.e. `import gsap from 'gsap';`
 */

/// <reference lib="dom" />

const libs = (window as any).__VSBLOOM__?.libs;

if (!libs?.gsap) {
    throw new Error("[VSBloom]: GSAP was not available, VSBloom's SharedLibraries may not have loaded correctly.");
}

export const gsap = libs.gsap;
export default libs.gsap;

//re-export types for TypeScript support
export type * from 'gsap';