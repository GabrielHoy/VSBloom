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

//re-export all PixiJS exports from the pre-loaded library
export const {
    Application,
    Container,
    Sprite,
    Graphics,
    Text,
    TextStyle,
    Texture,
    Point,
    Rectangle,
    Mesh,
    MeshGeometry,
    MeshRope,
    MeshPlane,
    MeshSimple,
    Ticker,
    Assets,
    Filter,
    BlurFilter,
    ColorMatrixFilter,
    DisplacementFilter,
    NoiseFilter,
    AbstractRenderer
} = libs.pixi;

//also export the pixi namespace directly
export const pixi = libs.pixi;
export default libs.pixi;

//re-export types for TypeScript support
export type * from 'pixi.js';