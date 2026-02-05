import bloom from 'bloom';
import type { Trail } from 'src/EffectLib/Bloom/VFX/Trail';
import { Application, MeshRope, Point, Texture, Graphics, Color } from 'pixi.js';
import type Janitor from 'src/EffectLib/Bloom/Janitors';
import { effectConfig } from '../TrailConfigTypes';

const vsbloom = window.__VSBLOOM__;

let configs: typeof effectConfig;
let janitor: Janitor;

function GetAbsolutePosition(element: Element): Point {
    const rect = element.getBoundingClientRect();
    return new Point((rect.left + rect.right) / 2 + window.scrollX, (rect.top + rect.bottom) / 2 + window.scrollY);
}

const currentCursorTrails = new Map<Element, Trail>();
const currentKnownCursorElements = new Set<Element>();
let app: Application;
let curTexture: Texture;

function OnCursorUpdated(cursor: Element): void {
    const newCursorPos = GetAbsolutePosition(cursor);
    const cursorTrail = currentCursorTrails.get(cursor);
    if (!cursorTrail) {
        vsbloom.Log('error', 'No cursor trail found for cursor');
        return;
    }


    const lastPos = cursorTrail.headPosition;

    if (!lastPos) {
        return;
    }
    if (newCursorPos.magnitudeSquared() < 1) {
        return;
    }
    if (lastPos.magnitudeSquared() < 1) {
        cursorTrail.SnapHeadTo(newCursorPos);
        return;
    }

    cursorTrail.goal = newCursorPos;
}

function OnScroll(): void {
    for (const cursor of currentKnownCursorElements) {
        OnCursorUpdated(cursor);
    }
}

function WatchNewCursorElement(cursor: Element): () => void {
    currentKnownCursorElements.add(cursor);
    const initialCursorPos = GetAbsolutePosition(cursor);

    // Initialize trail
    const newCursorTrail = new bloom.vfx.trails.Trail(app, initialCursorPos, {
        texture: curTexture,
        textureScale: 1
    });
    newCursorTrail.maxAngleChangePerFrameDeg = configs.solidTrailSpeed / 2;
    newCursorTrail.tailShorteningSpeed = configs.solidTrailSpeed / 2;
    newCursorTrail.headSpeed.set(configs.solidTrailSpeed, configs.solidTrailSpeed);
    newCursorTrail.proximityToGoalWhenAngularlyConstrainedForSlowdown = 25;
    newCursorTrail.maxTrailLength = configs.maxSolidTrailLength;

    currentCursorTrails.set(cursor, newCursorTrail);

    // Watch for style changes on the cursor element
    const observer = new MutationObserver(() => OnCursorUpdated(cursor));
    observer.observe(cursor, { attributeFilter: ['style'] });

    const rand = Math.round(Math.random()*10000);
    return () => {
        currentKnownCursorElements.delete(cursor);
        observer.disconnect();
        currentCursorTrails.delete(cursor);
        newCursorTrail.destroy();
    };
}


export async function InitTrail(effectCfgRef: typeof configs) {
    configs = effectCfgRef;
    janitor = new bloom.janitors.Janitor();

    app = new Application();
    await app.init({
        backgroundAlpha: 0,
        resizeTo: window,
        antialias: effectCfgRef.enableAA
    });

    app.canvas.classList.add('vsbloom-cursor-trail-canvas');
    document.body.appendChild(app.canvas);
    janitor.Add(() => {
        app.destroy(true, { children: true, texture: true, context: true, textureSource: true });
    });

    const trailColor = Color.isColorLike(effectCfgRef.color as string) ? effectCfgRef.color : 0xFFFFFF;

    const graphicsForTexture = new Graphics();
    graphicsForTexture.rect(0,0,1,effectCfgRef.solidTrailWidth).fill({ color: trailColor });

    curTexture = app.renderer.generateTexture(graphicsForTexture);
    janitor.Add(() => curTexture.destroy());

    // Watch for new cursor elements being added to the DOM
    // and hook up cursor update callbacks for them
    const cursorWatcher = bloom.dom.watch('.cursor.monaco-mouse-cursor-text', {
        within: '.cursors-layer',
        onAdded: WatchNewCursorElement
    });
    janitor.Add(() => cursorWatcher.stop());

    // Hook up calling cursor update callbacks for
    // cursors that are on screen whenever the user scrolls
    const scrollWatcher = bloom.dom.watch('.monaco-scrollable-element.editor-scrollable', {
        onAdded: (scrollable) => {
            scrollable.addEventListener('wheel', OnScroll, { passive: true });

            return () => {
                scrollable.removeEventListener('wheel', OnScroll);
            };
        }
    });
    janitor.Add(() => scrollWatcher.stop());
}

export async function CleanupTrail() {
    await janitor.Destroy();
    currentCursorTrails.clear();
    currentKnownCursorElements.clear();
}