import bloom from 'bloom';
import type { Trail } from 'src/EffectLib/Bloom/VFX/Trail';
import { Application, MeshRope, Point, Texture, Graphics } from 'pixi.js';
import type Janitor from 'src/EffectLib/Bloom/Janitors';

const vsbloom = window.__VSBLOOM__;

let configs: {
    trailDuration: number;
};
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

    const distFromTrailToCursor = newCursorPos.subtract(cursorTrail.headPosition).magnitude();

    // cursorTrail.tailShorteningSpeed = Math.max(2.5, cursorTrail.trailLength / 10);
    // cursorTrail.headSpeed.set(Math.max(10, distFromTrailToCursor / 5), Math.max(10, distFromTrailToCursor / 5));

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

    currentCursorTrails.set(cursor, newCursorTrail);

    // Watch for style changes on the cursor element
    const observer = new MutationObserver(() => OnCursorUpdated(cursor));
    observer.observe(cursor, { attributeFilter: ['style'] });

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
        antialias: true
    });

    // app.canvas.style.position = 'fixed';
    // app.canvas.style.top = '0';
    // app.canvas.style.left = '0';
    // app.canvas.style.pointerEvents = 'none';
    // app.canvas.style.zIndex = '9999';
    app.canvas.classList.add('vsbloom-cursor-trail-solid');
    document.body.appendChild(app.canvas);
    janitor.Add(() => {
        app.destroy(true, { children: true, texture: true });
    });

    const graphicsForTexture = new Graphics();
    graphicsForTexture.rect(0,0,16,16);
    graphicsForTexture.roundShape([
            { x: 0, y: 0, radius: 20 },
            { x: 16, y: 0, radius: 10 },
            { x: 16, y: 16, radius: 15 },
            { x: 0, y: 16, radius: 5 }
        ],
        4,
        false
    ).fill({ color: 0xFFFFFF, alpha: 1 });

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