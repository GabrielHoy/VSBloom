/**
 * A "Trail Target" is a point in 2D space that gradually accelerates
 * towards a goal position every frame.
 *
 * It is intended to be used as an intermediate "moving point" for trails
 * (see `Trail.ts`) to follow, when the consumer doesn't want a Trail
 * to head directly towards a real-world target like a cursor position
 * but instead towards a position that itself glides towards that target.
 *
 * This is useful for creating trails that "fly off" in random directions
 * when given a new target before homing in on it - several TrailTargets
 * sharing the same goal will diverge before converging, giving each Trail
 * that follows them a unique path even though they're all chasing
 * the same underlying point.
 *
 * Hooks into the application's ticker just like `Trail` does so its
 * physics step runs once per rendered frame regardless of how often
 * the consumer updates `goal`.
 */

import { type Application, Point } from 'pixi.js';

export interface TrailTargetOptions {
	/**
	 * Max speed in pixels/frame that the target's position
	 * can travel towards `goal`.
	 *
	 * Also doubles as the per-frame acceleration magnitude when
	 * the target is already in motion.
	 */
	speed?: number;
	/**
	 * If true, the very first frame after the target transitions
	 * from "at rest" to "goal has moved away", the velocity is
	 * initialized to a random direction at `speed * 2` magnitude
	 * instead of being aimed directly at the goal.
	 *
	 * The boost magnitude (above the per-frame velocity cap of `speed`)
	 * is intentional - it gives the random direction enough persistence
	 * to actually be visible before the per-frame acceleration toward
	 * the goal pulls velocity back in line.
	 *
	 * Useful when many TrailTargets share a goal and you want each one
	 * to follow a visually distinct path to it.
	 */
	randomInitialVelocity?: boolean;
}

export class TrailTarget {
	/**
	 * Current position of the trail target.
	 *
	 * Mutated in place every frame, so external consumers (e.g. a `Trail`
	 * whose `goal` aliases this Point) automatically see live updates.
	 */
	public pos: Point;
	/**
	 * Current velocity of the trail target, in pixels/frame.
	 */
	public velocity: Point = new Point(0, 0);
	/**
	 * Goal position the trail target is moving towards.
	 *
	 * Consumers should mutate this (e.g. via `goal.copyFrom(newPos)`)
	 * rather than reassigning it, so that any aliased references
	 * stay valid.
	 */
	public goal: Point;
	/**
	 * Max speed in pixels/frame the trail target's position
	 * can travel towards `goal`.
	 *
	 * Also doubles as the per-frame acceleration magnitude.
	 */
	public speed: number = 20;
	/**
	 * If true, transitions from at-rest -> moving fire off
	 * a random-direction velocity kick at `speed * 2` magnitude
	 * instead of a direct kick toward `goal`.
	 */
	public randomInitialVelocity: boolean = false;

	protected app: Application;
	protected updateCallback: () => void;

	public IsAtRest(): boolean {
		//"at rest" = sitting on top of the goal with no velocity to speak of
		return (
			this.pos.subtract(this.goal).magnitudeSquared() < 1 &&
			this.velocity.magnitudeSquared() < 1e-3
		);
	}

	public GetDistanceToGoal(): number {
		return this.pos.subtract(this.goal).magnitude();
	}

	/**
	 * Snaps both `pos` and `goal` to the given position immediately
	 * and zeroes out velocity, putting the target back into the at-rest state.
	 */
	public SnapTo(pos: Point): void {
		this.pos.copyFrom(pos);
		this.goal.copyFrom(pos);
		this.velocity.set(0, 0);
	}

	protected Update(): void {
		const dt = this.app.ticker.deltaTime;
		const toGoal = this.goal.subtract(this.pos);
		const distSq = toGoal.magnitudeSquared();

		if (distSq <= 1) {
			//goal is right under us; snap & zero velocity to settle.
			//this also serves as the "at rest" state for the next time
			//the goal moves away, since velocity will be zero.
			this.pos.copyFrom(this.goal);
			this.velocity.set(0, 0);
			return;
		}

		const isAtRest = this.velocity.magnitudeSquared() < 1e-3;
		if (isAtRest) {
			//transitioning rest -> motion; pick a starting velocity
			if (this.randomInitialVelocity) {
				//random direction, boosted past the per-frame cap so
				//the random-ness has a few frames of visual persistence
				//before acceleration toward the goal pulls it back in line
				this.velocity.set(
					(Math.random() - 0.5) * 2,
					(Math.random() - 0.5) * 2,
				);
				this.velocity
					.normalize(this.velocity)
					.multiplyScalar(this.speed * 2, this.velocity);
			} else {
				//direct kick toward goal at full speed
				toGoal.normalize(this.velocity).multiplyScalar(this.speed, this.velocity);
			}
		} else {
			//already in motion; accelerate velocity toward the goal.
			//this is what reorients a random-direction kick back toward
			//the goal over the course of several frames
			const accel = toGoal.normalize().multiplyScalar(this.speed * dt);
			this.velocity.add(accel, this.velocity);

			//cap speed; this also "decays" the random-initial boost
			//once it's no longer needed for the visual fly-off effect
			if (this.velocity.magnitude() > this.speed) {
				this.velocity.normalize(this.velocity).multiplyScalar(this.speed, this.velocity);
			}
		}

		//apply velocity to position. clamp the goal-aligned component
		//of the movement so we don't overshoot when homing in -
		//but allow movement perpendicular/away from the goal to pass through
		//unmolested (so the random-initial fly-off arc still works)
		const movement = this.velocity.multiplyScalar(dt);
		const distToGoal = Math.sqrt(distSq);
		const toGoalDir = toGoal.normalize();
		const towardGoalProgress = movement.dot(toGoalDir);
		if (towardGoalProgress > distToGoal) {
			//projected motion along the goal direction would overshoot;
			//collapse the movement onto the goal direction at exactly distToGoal
			toGoalDir.multiplyScalar(distToGoal, movement);
		}
		this.pos.add(movement, this.pos);
	}

	constructor(
		app: Application,
		startingPosition: Point,
		options?: TrailTargetOptions,
	) {
		this.app = app;
		this.pos = startingPosition.clone();
		this.goal = startingPosition.clone();
		if (options?.speed !== undefined) {
			this.speed = options.speed;
		}
		if (options?.randomInitialVelocity !== undefined) {
			this.randomInitialVelocity = options.randomInitialVelocity;
		}

		this.updateCallback = () => this.Update();
		app.ticker.add(this.updateCallback);
	}

	public destroy(): void {
		if (this.updateCallback && this.app?.ticker) {
			this.app.ticker.remove(this.updateCallback);
		}
	}
}
