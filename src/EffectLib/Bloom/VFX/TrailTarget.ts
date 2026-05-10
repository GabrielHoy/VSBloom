/**
 * A "Trail Target" is a point in 2D space that gradually accelerates
 * towards a goal position every frame.
 *
 * It is intended to be used as an intermediate "moving point" for trails
 * (see `Trail.ts`) to follow, when the consumer doesn't want a Trail
 * to head directly towards a real-world target like a cursor position
 * but instead towards a position that itself glides towards that target.
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
	/**
	 * Distance from the goal at which lateral velocity
	 * begins to be damped, in pixels. Prevents tangential approaches from
	 * causing the target to orbit indefinitely around the goal.
	 *
	 * *0 disables this feature.*
	 */
	lateralDampRadius?: number;
	/**
	 * The amount of time to wait after a random initial velocity impulse
	 * before the target begins to pursue the goal.
	 *
	 * *0 disables this feature.*
	 */
	postRandomImpulseTargetPursuitDelaySeconds?: number;
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
	/**
	 * Distance from the goal at which lateral velocity
	 * begins to be damped, in pixels. Prevents tangential approaches from
	 * causing the target to orbit indefinitely around the goal.
	 *
	 * *0 disables this feature.*
	 */
	public lateralDampRadius: number = 0;
	/**
	 * The amount of time to wait after a random initial velocity impulse
	 * before the target begins to pursue the goal.
	 *
	 * *0 disables this feature.*
	 */
	public postRandomImpulseTargetPursuitDelaySeconds: number = 0;

	protected app: Application;
	protected updateCallback: () => void;
	protected lastRandomImpulseTimestamp: number = 0;
	protected isInRandomImpulseDelayPeriod: boolean = false;

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

		const distToGoal = Math.sqrt(distSq);
		const toGoalDir = toGoal.normalize();
		const isAtRest = this.velocity.magnitudeSquared() < 1e-3;
		const dTFromRandomImpulse = (this.app.ticker.lastTime - this.lastRandomImpulseTimestamp) / 1000;
		const insidePostRandomImpulseDelayPeriod = this.postRandomImpulseTargetPursuitDelaySeconds > 0 && dTFromRandomImpulse < this.postRandomImpulseTargetPursuitDelaySeconds;

		if (isAtRest && !this.isInRandomImpulseDelayPeriod) {
			//transitioning rest -> motion; pick a starting velocity
			if (this.randomInitialVelocity) {
				//random direction, boosted past the per-frame cap so
				//the random-ness has a few frames of visual persistence
				//before acceleration toward the goal pulls it back in line
				this.velocity.set((Math.random() - 0.5) * 1, (Math.random() - 0.5) * 1);
				this.velocity
					.normalize(this.velocity)
					.multiplyScalar(this.speed * 1, this.velocity);

				this.lastRandomImpulseTimestamp = this.app.ticker.lastTime;
			} else {
				//direct kick toward goal at full speed
				toGoal.normalize(this.velocity).multiplyScalar(this.speed, this.velocity);
			}
		} else {
			if (this.postRandomImpulseTargetPursuitDelaySeconds > 0 && dTFromRandomImpulse < this.postRandomImpulseTargetPursuitDelaySeconds) {
				// we're still in the post-random-impulse delay period and we have velocity left; don't accelerate towards the goal yet
				// instead, scale velocity towards zero so that it reaches (almost) zero in postRandomImpulseTargetPursuitDelaySeconds seconds.
				const timeLeft = Math.max(this.postRandomImpulseTargetPursuitDelaySeconds - dTFromRandomImpulse, 1e-4);
				const decayPerFrame = 1e-1 ** (this.app.ticker.deltaMS / (timeLeft * 1000));
				this.velocity.multiplyScalar(decayPerFrame, this.velocity);
				this.isInRandomImpulseDelayPeriod = true;
			} else {
				//already in motion; accelerate velocity toward the goal.
				//this is what reorients a random-direction kick back toward
				//the goal over the course of several frames
				const accel = toGoal.normalize().multiplyScalar(this.speed * dt);
				this.velocity.add(accel, this.velocity);
				this.isInRandomImpulseDelayPeriod = false;
			}


			//cap speed; this also "decays" the random-initial boost
			//once it's no longer needed for the visual fly-off effect
			if (this.velocity.magnitude() > this.speed) {
				this.velocity.normalize(this.velocity).multiplyScalar(this.speed, this.velocity);
			}
		}

		if (this.lateralDampRadius > 0 && distToGoal < this.lateralDampRadius) {
			const towardComponent = this.velocity.dot(toGoalDir);
			const lateralX = this.velocity.x - towardComponent * toGoalDir.x;
			const lateralY = this.velocity.y - towardComponent * toGoalDir.y;
			const dampStrength = 1 - distToGoal / this.lateralDampRadius;
			this.velocity.x -= lateralX * dampStrength * dt;
			this.velocity.y -= lateralY * dampStrength * dt;
		}

		//apply velocity to position. clamp the goal-aligned component
		//of the movement so we don't overshoot when homing in -
		//but allow movement perpendicular/away from the goal to pass through
		//unmolested (so the random-initial fly-off arc still works)
		const movement = this.velocity.multiplyScalar(dt);
		const towardGoalProgress = movement.dot(toGoalDir);
		if (towardGoalProgress > distToGoal) {
			//projected motion along the goal direction would overshoot;
			//collapse the movement onto the goal direction at exactly distToGoal
			toGoalDir.multiplyScalar(distToGoal, movement);
			this.velocity.set(0, 0);
		}
		this.pos.add(movement, this.pos);
	}

	constructor(app: Application, startingPosition: Point, options?: TrailTargetOptions) {
		this.app = app;
		this.pos = startingPosition.clone();
		this.goal = startingPosition.clone();
		if (options?.speed !== undefined) {
			this.speed = options.speed;
		}
		if (options?.randomInitialVelocity !== undefined) {
			this.randomInitialVelocity = options.randomInitialVelocity;
		}
		if (options?.lateralDampRadius !== undefined) {
			this.lateralDampRadius = options.lateralDampRadius;
		}
		if (options?.postRandomImpulseTargetPursuitDelaySeconds !== undefined) {
			this.postRandomImpulseTargetPursuitDelaySeconds =
				options.postRandomImpulseTargetPursuitDelaySeconds;
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
