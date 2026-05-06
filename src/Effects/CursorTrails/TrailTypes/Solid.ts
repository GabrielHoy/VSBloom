import bloom from 'bloom';
import { Application, Color, Graphics, Point, type Texture } from 'pixi.js';
import type Janitor from 'src/EffectLib/Bloom/Janitors';
import type { Trail } from 'src/EffectLib/Bloom/VFX/Trail';
import type { TrailTarget } from 'src/EffectLib/Bloom/VFX/TrailTarget';
import { effectConfig } from '../TrailConfigTypes';

const vsbloom = window.__VSBLOOM__;

let configs: typeof effectConfig;
let janitor: Janitor;

type CursorTrail = {
	trail: Trail;
	headTarget: TrailTarget;
}

function GetAbsolutePosition(element: Element): Point {
	const rect = element.getBoundingClientRect();
	return new Point(
		(rect.left + rect.right) / 2 + window.scrollX,
		(rect.top + rect.bottom) / 2 + window.scrollY,
	);
}

const currentCursorTrailArrays = new Map<Element, CursorTrail[]>();
const currentKnownCursorElements = new Set<Element>();
let app: Application;
let curTexture: Texture;

function OnCursorUpdated(cursor: Element): void {
	const newCursorPos = GetAbsolutePosition(cursor);
	const cursorTrailsForThisCursor = currentCursorTrailArrays.get(cursor);
	if (!cursorTrailsForThisCursor) {
		vsbloom.Log('error', 'No cursor trail found for cursor');
		return;
	}

	//Each TrailTarget runs its own per-frame physics in its ticker callback,
	//so all we need to do here is announce the new cursor position to them.
	//Each Trail's `goal` is aliased to its TrailTarget's `pos`, so the trail
	//head will glide toward the trail target which itself glides toward the cursor.
	for (const { headTarget } of cursorTrailsForThisCursor) {
		headTarget.goal.copyFrom(newCursorPos);
	}
}

function OnScroll(): void {
	for (const cursor of currentKnownCursorElements) {
		OnCursorUpdated(cursor);
	}
}

function WatchNewCursorElement(cursor: Element): () => void {
	currentKnownCursorElements.add(cursor);
	const initialCursorPos = GetAbsolutePosition(cursor);

	// Initialize all of the trails for this cursor
	const trailsForThisCursor: CursorTrail[] = [];
	for (let i = 0; i < configs.solidTrailCount; i++) {
		const newTrail = new bloom.vfx.trails.Trail(app, initialCursorPos, {
			texture: curTexture,
			textureScale: 1,
		});
		newTrail.maxAngleChangePerFrameDeg = configs.solidTrailSpeed / 2;
		newTrail.tailShorteningSpeed = configs.solidTrailSpeed / 2;
		newTrail.headSpeed.set(configs.solidTrailSpeed, configs.solidTrailSpeed);
		newTrail.proximityToGoalWhenAngularlyConstrainedForSlowdown = 25;
		newTrail.maxTrailLength = configs.maxSolidTrailLength;

		const newHeadTarget = new bloom.vfx.trails.TrailTarget(app, initialCursorPos, {
			speed: configs.solidTrailSpeed,
			//First trail tracks the cursor directly; additional trails get a
			//random initial direction so each one flies off uniquely before
			//homing back in on the cursor — chaotic, distinct visual paths
			//even though they all share the same goal.
			randomInitialVelocity: i > 0,
		});

		//Alias the trail's `goal` to the head target's `pos` (same Point instance).
		//Since TrailTarget mutates `pos` in place every frame, the trail's goal
		//tracks live without any per-frame copy needed in this file.
		newTrail.goal = newHeadTarget.pos;

		trailsForThisCursor.push({
			trail: newTrail,
			headTarget: newHeadTarget,
		});
	}
	currentCursorTrailArrays.set(cursor, trailsForThisCursor);

	// Watch for style changes on the cursor element
	const observer = new MutationObserver(() => OnCursorUpdated(cursor));
	observer.observe(cursor, { attributeFilter: ['style'] });

	return () => {
		currentKnownCursorElements.delete(cursor);
		observer.disconnect();
		currentCursorTrailArrays.delete(cursor);
		for (const { trail, headTarget } of trailsForThisCursor) {
			trail.destroy();
			headTarget.destroy();
		}
	};
}

export async function InitTrail(effectCfgRef: typeof configs) {
	configs = effectCfgRef;
	janitor = new bloom.janitors.Janitor();

	app = new Application();
	await app.init({
		backgroundAlpha: 0,
		resizeTo: window,
		antialias: effectCfgRef.enableAA,
	});

	app.canvas.classList.add('vsbloom-cursor-trail-canvas');
	document.body.appendChild(app.canvas);
	janitor.Add(() => {
		app.destroy(true, { children: true, texture: true, context: true, textureSource: true });
	});

	const trailColor = Color.isColorLike(effectCfgRef.color as string)
		? effectCfgRef.color
		: 0xffffff;

	const graphicsForTexture = new Graphics();
	graphicsForTexture.rect(0, 0, 1, effectCfgRef.solidTrailWidth).fill({ color: trailColor });

	curTexture = app.renderer.generateTexture(graphicsForTexture);
	janitor.Add(() => curTexture.destroy());

	// Watch for new cursor elements being added to the DOM
	// and hook up cursor update callbacks for them
	const cursorWatcher = bloom.dom.watch('.cursor.monaco-mouse-cursor-text', {
		within: '.cursors-layer',
		onAdded: WatchNewCursorElement,
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
		},
	});
	janitor.Add(() => scrollWatcher.stop());
}

export async function CleanupTrail() {
	await janitor.Destroy();
	currentCursorTrailArrays.clear();
	currentKnownCursorElements.clear();
}
