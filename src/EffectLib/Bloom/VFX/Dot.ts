/**
 * A simple VFX primitive that renders a filled
 * circle at a given position utilizing PixiJS Graphics.
 * 
 * Primarily utilized for debugging.
 */

import {
	type Application,
	type ColorSource,
	type DestroyOptions,
	Graphics,
	type Point,
} from 'pixi.js';

export interface DotOptions {
	color?: ColorSource;
	radius?: number;
	alpha?: number;
}

export class Dot {
	public readonly graphics: Graphics;

	/**
	 * World-space position where the dot is rendered.
	 *
	 * A ticker callback reads this position every frame and repositions
	 * the dot accordingly.
	 */
	public position: Point;

	public color: ColorSource;
	public radius: number;
	public alpha: number;

	protected app: Application;
	protected updateCallback: () => void;

	/**
	 * Redraws the internal dot's `Graphics` object.
	 * 
	 * You should call this after changing `color`, `radius`,
	 * or `alpha` to apply the update to the dot's visual appearance.
	 */
	public Redraw(): void {
		this.graphics.clear();
		this.graphics
			.circle(0, 0, this.radius)
			.fill({ color: this.color, alpha: this.alpha });
	}

	protected UpdatePosition(): void {
		this.graphics.position.set(this.position.x, this.position.y);
	}

	constructor(
		app: Application,
		startingPosition: Point,
		options?: DotOptions,
	) {
		this.app = app;
		this.position = startingPosition.clone();
		this.color = options?.color ?? 0xffffff;
		this.radius = options?.radius ?? 5;
		this.alpha = options?.alpha ?? 1;

		this.graphics = new Graphics();
		this.Redraw();
		this.UpdatePosition();

		app.stage.addChild(this.graphics);

		this.updateCallback = () => this.UpdatePosition();
		app.ticker.add(this.updateCallback);
	}

	public destroy(
		destroyOptions: DestroyOptions = { children: true, textureSource: false },
	): void {
		if (this.updateCallback && this.app?.ticker) {
			this.app.ticker.remove(this.updateCallback);
		}
		if (this.graphics) {
			this.graphics.removeFromParent();
			this.graphics.destroy(destroyOptions);
		}
	}
}
