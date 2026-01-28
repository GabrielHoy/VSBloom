import bloom from 'bloom';
import gsap from 'gsap';
import { Application } from 'pixi.js';
import type Janitor from 'src/EffectLib/Bloom/Janitors';

let configs: {
    trailDuration: number;
};
let janitor: Janitor;

type Position = { x: number; y: number };
type TemporalPosition = { timestamp: number } & Position;

const trailPoints: TemporalPosition[] = [];

let svg: SVGSVGElement | null = null;
let path: SVGPathElement | null = null;

function GetAbsolutePosition(element: Element): Position {
    const rect = element.getBoundingClientRect();
    return { x: (rect.left + rect.right) / 2 + window.scrollX, y: (rect.top + rect.bottom) / 2 + window.scrollY };
}

function TrimExpiredPoints() {
    const now = performance.now();
    const expirationThreshold = configs.trailDuration * 1000;

    while (trailPoints.length > 0 && now - trailPoints[0].timestamp > expirationThreshold) {
        trailPoints.shift();
    }
}

function PointsToPathString(points: Position[]): string {
    if (points.length === 0) {
        return '';
    }
    if (points.length === 1) {
        return `M ${points[0].x} ${points[0].y}`;
    }

    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

function AppendTrailPoint(point: Position) {
    trailPoints.push({ timestamp: performance.now(), ...point });
}

function GetInterpolatedPoints(): Position[] {
    if (trailPoints.length === 0) {
        return [];
    }

    const now = performance.now();
    const maxAge = configs.trailDuration * 1000;
    const result: Position[] = [];
    
    for (let i = 0; i < trailPoints.length; i++) {
        const point = trailPoints[i];
        const age = now - point.timestamp;
        
        if (i === 0 && trailPoints.length > 1) {
            const next = trailPoints[1];
            const gapToNext = next.timestamp - point.timestamp;
            const timeUntilExpiry = maxAge - age;
            
            // Only interpolate during the transition window
            // (when this point is about to expire and hand off to the next)
            if (gapToNext > 0 && timeUntilExpiry < gapToNext) {
                const fadeProgress = 1 - (timeUntilExpiry / gapToNext);
                result.push({
                    x: point.x + (next.x - point.x) * fadeProgress,
                    y: point.y + (next.y - point.y) * fadeProgress,
                });
            } else {
                // Not yet in transition window - stay at this point's position
                result.push({ x: point.x, y: point.y });
            }
        } else {
            result.push({ x: point.x, y: point.y });
        }
    }
    
    return result;
}

let frameId: number | null = null;
function TrailAnimationFrame() {
    if (!path) {
        return;
    }

    TrimExpiredPoints();

    if (trailPoints.length > 1) {
        path.setAttribute('d', PointsToPathString(GetInterpolatedPoints()));

        const now = performance.now();
        const expirationThreshold = configs.trailDuration * 1000;
        const oldestPointAge = now - trailPoints[0].timestamp;
        const tailFadePercent = (oldestPointAge / expirationThreshold) * 100;

        gsap.set(path, {
            drawSVG: `${Math.min(tailFadePercent, 100) * 0.1}% 100%`
        });
    } else {
        path.setAttribute('d', '');
    }

    frameId = requestAnimationFrame(TrailAnimationFrame);
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

    AppendTrailPoint(newCursorPos);

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

    path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', 'white');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('fill', 'none');

    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('vsbloom-cursor-trail-solid');
    svg.appendChild(path);

    document.body.appendChild(svg);
    janitor.Add(() => {
        svg?.remove();
        path?.remove();
        svg = null;
        path = null;
    });

    //watch for new cursor elements being added to the DOM
    //and hook up cursor update callbacks for them
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

    frameId = requestAnimationFrame(TrailAnimationFrame);
    janitor.Add(() => {
        if (frameId) {
            cancelAnimationFrame(frameId);
            frameId = null;
        }
    });
}

export function CleanupTrail() {
    janitor.Destroy();
}