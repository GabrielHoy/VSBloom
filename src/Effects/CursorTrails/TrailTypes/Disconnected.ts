import bloom from 'bloom';
import gsap from 'gsap';
import type Janitor from 'src/EffectLib/Bloom/Janitors';
import { effectConfig } from '../TrailConfigTypes';
import { Color } from 'pixi.js';

type Position = { x: number; y: number };

const MIN_DISTANCE = 2;
const LINE_THICKNESS_MIN = 2;
const LINE_THICKNESS_MAX = 4;
const INITIAL_OPACITY = 0.618;

let configs: typeof effectConfig;
let janitor: Janitor;

function GetRandom(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function GetAbsolutePosition(element: Element): Position {
    const rect = element.getBoundingClientRect();
    return { x: (rect.left + rect.right) / 2 + window.scrollX, y: (rect.top + rect.bottom) / 2 + window.scrollY };
}

let currentEffectContainer: HTMLDivElement | null = null;
function CreateNewEffectContainer(): void {
    if (currentEffectContainer) {
        throw new Error('Attempt to create a new cursor trail effect container when one already exists');
    }

    currentEffectContainer = document.createElement('div');
    currentEffectContainer.className = 'vsbloom-disconnected-cursor-trail-effect-container';
    document.body.appendChild(currentEffectContainer);
    janitor.AddNamed('effect-container', () => {
        currentEffectContainer?.remove();
        currentEffectContainer = null;
    });
}

function CreateCursorTrail(from: Position, to: Position): void {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance < MIN_DISTANCE) {
        return;
    }

    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 180;
    const thickness = GetRandom(LINE_THICKNESS_MIN, LINE_THICKNESS_MAX);
    const color = (new Color(Color.isColorLike(configs.color) ? configs.color : 0xFFFFFF)).toRgbaString();

    const trail = document.createElement('div');
    trail.className = 'vsbloom-disconnected-cursor-trail-effect';
    Object.assign(trail.style, {
        position: 'absolute',
        zIndex: '100',
        pointerEvents: 'none',
        width: `${distance}px`,
        height: `${thickness}px`,
        borderRadius: `${thickness / 2}px`,
        backgroundColor: color,
        left: `${to.x}px`,
        top: `${to.y}px`,
        transform: `rotate(${angle}deg)`,
        transformOrigin: 'left center',
        opacity: String(INITIAL_OPACITY),
    });

    if (!currentEffectContainer) {
        CreateNewEffectContainer();
    }
    const trailRemovalTask = janitor.Add(() => trail.remove());
    currentEffectContainer?.appendChild(trail);

    gsap.to(trail, {
        opacity: 0,
        scaleX: 0,
        duration: configs.disconnectedTrailSegmentLifetime,
        ease: 'none',//'power2.out',
        onComplete: () => {
            trailRemovalTask.CleanNow();
            if (currentEffectContainer?.children.length === 0) {
                janitor.GetNamedCleanupTask('effect-container')?.CleanNow();
            }
        },
    });
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
        //either position is generally invalid,
        //so we dont want to create a trail from/to 0,0 for it
        //just update the position and return
        currentCursorPositions.set(cursor, newCursorPos);
        return;
    }

    CreateCursorTrail(lastPos, newCursorPos);

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

    //Initialize position
    currentCursorPositions.set(cursor, initialCursorPos);

    //Watch for style changes on the cursor element
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

    //watch for changes in cursor positions
    const cursorWatcher = bloom.dom.watch('.cursor.monaco-mouse-cursor-text', {
        within: '.cursors-layer',
        onAdded: WatchNewCursorElement
    });
    janitor.Add(() => cursorWatcher.stop());

    //hook up calling cursor update callbacks for
    //cursors that are on screen whenever the user
    //scrolls
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