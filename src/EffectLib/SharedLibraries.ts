/**
 * VSBloom Shared Libraries Runtime
 * 
 * This file bundles shared libraries (like GSAP) that are used across
 * multiple effects. It is built as an IIFE and injected into workbench.html
 * BEFORE the VSBloom Client, ensuring libraries are available immediately
 * when effects load.
 * 
 * Effects access these libraries via shim files that re-export from
 * window.__VSBLOOM__.libs, allowing clean `import gsap from 'gsap'` syntax.
 */

/// <reference lib="dom" />
import {
    gsap,
    CustomEase,
    CustomBounce,
    CustomWiggle,
    RoughEase,
    ExpoScaleEase,
    SlowMo,
    Draggable,
    DrawSVGPlugin,
    EaselPlugin,
    Flip,
    GSDevTools,
    InertiaPlugin,
    MotionPathHelper,
    MotionPathPlugin,
    MorphSVGPlugin,
    Observer,
    Physics2DPlugin,
    PhysicsPropsPlugin,
    PixiPlugin,
    ScrambleTextPlugin,
    ScrollTrigger,
    ScrollSmoother,
    ScrollToPlugin,
    SplitText,
    TextPlugin,
} from 'gsap/all';

import * as motion from 'motion';
import * as pixi from 'pixi.js';
import bloom from './Bloom/Bloom';

//Initialize __VSBLOOM__ if not present,
//this should always be the case since SharedLibs loads before Client.
if (!(window as any).__VSBLOOM__) {
    (window as any).__VSBLOOM__ = {};
}
gsap.registerPlugin(Draggable,DrawSVGPlugin,EaselPlugin,Flip,GSDevTools,InertiaPlugin,MotionPathHelper,MotionPathPlugin,MorphSVGPlugin,Observer,Physics2DPlugin,PhysicsPropsPlugin,PixiPlugin,ScrambleTextPlugin,ScrollTrigger,ScrollSmoother,ScrollToPlugin,SplitText,TextPlugin,RoughEase,ExpoScaleEase,SlowMo,CustomEase,CustomBounce,CustomWiggle);

//Expose libraries on the global
(window as any).__VSBLOOM__.libs = {
    motion,
    bloom,
    gsap,
    pixi,
    GSAP_CustomEase: CustomEase,
    GSAP_CustomBounce: CustomBounce,
    GSAP_CustomWiggle: CustomWiggle,
    GSAP_RoughEase: RoughEase,
    GSAP_ExpoScaleEase: ExpoScaleEase,
    GSAP_SlowMo: SlowMo,
    GSAP_Draggable: Draggable,
    GSAP_DrawSVGPlugin: DrawSVGPlugin,
    GSAP_EaselPlugin: EaselPlugin,
    GSAP_Flip: Flip,
    GSAP_GSDevTools: GSDevTools,
    GSAP_InertiaPlugin: InertiaPlugin,
    GSAP_MotionPathHelper: MotionPathHelper,
    GSAP_MotionPathPlugin: MotionPathPlugin,
    GSAP_MorphSVGPlugin: MorphSVGPlugin,
    GSAP_Observer: Observer,
    GSAP_Physics2DPlugin: Physics2DPlugin,
    GSAP_PhysicsPropsPlugin: PhysicsPropsPlugin,
    GSAP_PixiPlugin: PixiPlugin,
    GSAP_ScrambleTextPlugin: ScrambleTextPlugin,
    GSAP_ScrollTrigger: ScrollTrigger,
    GSAP_ScrollSmoother: ScrollSmoother,
    GSAP_ScrollToPlugin: ScrollToPlugin,
    GSAP_SplitText: SplitText,
    GSAP_TextPlugin: TextPlugin,
};

console.log('[VSBloom]: Successfully Pre-loaded the following Client Effect Libraries:', Object.keys((window as any).__VSBLOOM__.libs).filter(key => !key.startsWith('GSAP_')).map(key => key === 'gsap' ? "gsap/all" : key)); //no need to spam all the gsap plugins in the console