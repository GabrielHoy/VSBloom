/**
 * Creates trailing lines that follow the text cursor in editor instances.
 */

import bloom from 'bloom';
import gsap from 'gsap';
const vsbloom = window.__VSBLOOM__;

type Position = { x: number; y: number };

let TRAIL_DURATION: number = 0.75;

const MIN_DISTANCE = 2;
const LINE_THICKNESS_MIN = 2;
const LINE_THICKNESS_MAX = 4;
const INITIAL_OPACITY = 0.618;

function GetRandom(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function GetAbsolutePosition(element: Element): Position {
    const rect = element.getBoundingClientRect();
    return { x: (rect.left + rect.right) / 2 + window.scrollX, y: (rect.top + rect.bottom) / 2 + window.scrollY };
}

let currentEffectContainer: HTMLDivElement | null = null;
function CreateCursorTrail(from: Position, to: Position): void {
    if (!currentEffectContainer) {
        vsbloom.Log('error', 'No effect container found for cursor trail creation');
        return;
    }
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance < MIN_DISTANCE) {
        return;
    }

    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 180;
    const thickness = GetRandom(LINE_THICKNESS_MIN, LINE_THICKNESS_MAX);
    const brightness = GetRandom(100, 255);

    const trail = document.createElement('div');
    trail.className = 'vsbloom-cursor-trail-effect';
    Object.assign(trail.style, {
        position: 'absolute',
        zIndex: '100',
        pointerEvents: 'none',
        width: `${distance}px`,
        height: `${thickness}px`,
        borderRadius: `${thickness / 2}px`,
        backgroundColor: `rgb(${brightness}, ${brightness}, ${brightness})`,
        left: `${to.x}px`,
        top: `${to.y}px`,
        transform: `rotate(${angle}deg)`,
        transformOrigin: 'left center',
        opacity: String(INITIAL_OPACITY),
    });

    currentEffectContainer?.appendChild(trail);

    gsap.to(trail, {
        opacity: 0,
        scaleX: 0,
        duration: TRAIL_DURATION,
        ease: 'power2.out',
        onComplete: () => trail.remove(),
    });
}

const currentCursorPositions = new WeakMap<Element, Position>();
const cursorUpdateCallbacks = new WeakMap<Element, (() => void)>();
function OnCursorUpdated(cursor: Element): void {
    const newCursorPos = GetAbsolutePosition(cursor);
    const lastPos = currentCursorPositions.get(cursor);
    vsbloom.Log('debug', 'Cursor updated', { newCursorPos, lastPos });

    if (!lastPos) {
        return;
    }
    if ((lastPos.x < 1 || lastPos.y < 1) || (newCursorPos.x < 1 || newCursorPos.y < 1)) {
        //either position is generally invalid,
        //so we dont want to create a trail from/to 0,0 for it
        //just update the position and return
        currentCursorPositions.set(cursor, newCursorPos);
        return;
    }

    CreateCursorTrail(lastPos, newCursorPos);

    currentCursorPositions.set(cursor, newCursorPos);
}

function WatchNewCursorElement(cursor: Element): () => void {
    const initialCursorPos = GetAbsolutePosition(cursor);

    //Initialize position
    currentCursorPositions.set(cursor, initialCursorPos);

    //Watch for style changes on the cursor element
    const updateCallbackForCursor = () => OnCursorUpdated(cursor);
    cursorUpdateCallbacks.set(cursor, updateCallbackForCursor);
    // const observer = new MutationObserver(updateCallbackForCursor);
    // observer.observe(cursor, { attributeFilter: ['style'] });

    
    //hook up calling cursor update callbacks for
    //cursors that are on screen whenever the user
    //scrolls
    const scrlTrgr = ScrollTrigger.create({
        trigger: cursor,
        scrub: 1,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: () => vsbloom.Log('debug', 'Cursor updated'),
    });

    return () => {
        // observer.disconnect();
        scrlTrgr.kill();
        cursorUpdateCallbacks.delete(cursor);
        currentCursorPositions.delete(cursor);
    };
}

const cleanupTasks: (() => void)[] = [];
export async function Start() {
    vsbloom.Log('debug', 'Starting Cursor Trails effect');

    //effect container for the cursor trails
    currentEffectContainer = document.createElement('div');
    currentEffectContainer.className = 'vsbloom-cursor-trail-effect-container';
    document.body.appendChild(currentEffectContainer);
    cleanupTasks.push(() => currentEffectContainer?.remove());

    //watch for changes in cursor positions
    const cursorWatcher = bloom.dom.watch('.cursor.monaco-mouse-cursor-text', {
        within: '.cursors-layer',
        onAdded: (cursor) => WatchNewCursorElement(cursor),
    });
    cleanupTasks.push(() => cursorWatcher.stop());

    //register an effect config mutator for the trail duration
    const trailDurationMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: 'cursorTrail.duration',
        internalValueMutator: (changedValue) => {
            TRAIL_DURATION = (changedValue as number) / 1000;
        }
    });
    cleanupTasks.push(() => bloom.configs.UnregisterEffectConfigMutator(trailDurationMutator));
}
export function Stop() {
    cleanupTasks.forEach(task => task());
    cleanupTasks.length = 0;

    document.querySelectorAll('.vsbloom-cursor-trail-effect').forEach(el => el.remove());
}