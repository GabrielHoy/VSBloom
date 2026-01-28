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

export const CustomEase = libs.GSAP_CustomEase;
export const CustomBounce = libs.GSAP_CustomBounce;
export const CustomWiggle = libs.GSAP_CustomWiggle;
export const RoughEase = libs.GSAP_RoughEase;
export const ExpoScaleEase = libs.GSAP_ExpoScaleEase;
export const SlowMo = libs.GSAP_SlowMo;
export const Draggable = libs.GSAP_Draggable;
export const DrawSVGPlugin = libs.GSAP_DrawSVGPlugin;
export const EaselPlugin = libs.GSAP_EaselPlugin;
export const Flip = libs.GSAP_Flip;
export const GSDevTools = libs.GSAP_GSDevTools;
export const InertiaPlugin = libs.GSAP_InertiaPlugin;
export const MotionPathHelper = libs.GSAP_MotionPathHelper;
export const MotionPathPlugin = libs.GSAP_MotionPathPlugin;
export const MorphSVGPlugin = libs.GSAP_MorphSVGPlugin;
export const Observer = libs.GSAP_Observer;
export const Physics2DPlugin = libs.GSAP_Physics2DPlugin;
export const PhysicsPropsPlugin = libs.GSAP_PhysicsPropsPlugin;
export const PixiPlugin = libs.GSAP_PixiPlugin;
export const ScrambleTextPlugin = libs.GSAP_ScrambleTextPlugin;
export const ScrollTrigger = libs.GSAP_ScrollTrigger;
export const ScrollSmoother = libs.GSAP_ScrollSmoother;
export const ScrollToPlugin = libs.GSAP_ScrollToPlugin;
export const SplitText = libs.GSAP_SplitText;
export const TextPlugin = libs.GSAP_TextPlugin;

//re-export types for TypeScript support
export type * from 'gsap';