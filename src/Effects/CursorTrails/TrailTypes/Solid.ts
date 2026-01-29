import bloom from 'bloom';
import { Application, MeshRope, Point, Texture, Graphics } from 'pixi.js';
import type Janitor from 'src/EffectLib/Bloom/Janitors';

const vsbloom = window.__VSBLOOM__;

let configs: {
    trailDuration: number;
};
let janitor: Janitor;

type Position = { x: number; y: number };
type TemporalPosition = { timestamp: number } & Position;

function GetAbsolutePosition(element: Element): Position {
    const rect = element.getBoundingClientRect();
    return { x: (rect.left + rect.right) / 2 + window.scrollX, y: (rect.top + rect.bottom) / 2 + window.scrollY };
}

const currentCursorPositions = new WeakMap<Element, Position>();
const currentKnownCursorElements = new Set<Element>();

function OnCursorUpdated(cursor: Element): void {
    const newCursorPos = GetAbsolutePosition(cursor);
    const lastPos = currentCursorPositions.get(cursor);

    if (!lastPos) {
        return;
    }
    if ((lastPos.x < 1 || lastPos.y < 1) || (newCursorPos.x < 1 || newCursorPos.y < 1)) {
        // Either position is generally invalid,
        // so we don't want to create a trail from/to 0,0 for it
        // just update the position and return
        currentCursorPositions.set(cursor, newCursorPos);
        return;
    }

    // AppendTrailPoint(newCursorPos);
    currentCursorPositions.set(cursor, newCursorPos);
}

function OnScroll(): void {
    for (const cursor of currentKnownCursorElements) {
        OnCursorUpdated(cursor);
    }
}

function WatchNewCursorElement(cursor: Element): () => void {
    currentKnownCursorElements.add(cursor);
    const initialCursorPos = GetAbsolutePosition(cursor);

    // Initialize position
    currentCursorPositions.set(cursor, initialCursorPos);

    // Watch for style changes on the cursor element
    const observer = new MutationObserver(() => OnCursorUpdated(cursor));
    observer.observe(cursor, { attributeFilter: ['style'] });

    return () => {
        currentKnownCursorElements.delete(cursor);
        observer.disconnect();
        currentCursorPositions.delete(cursor);
    };
}

export async function InitTrail(effectCfgRef: typeof configs) {
    configs = effectCfgRef;
    janitor = new bloom.janitors.Janitor();

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

export function CleanupTrail() {
    janitor.Destroy();
}