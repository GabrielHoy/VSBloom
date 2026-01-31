/**
 * An implementation of a Trail effect class for VSBloom,
 * intended to be used as a basic implementation layer
 * to provide common trail-ish functionality for effects
 * to then build upon in their own specific ways.
 * 
 * Utilizes PixiJS's MeshRope class for trail rendering.
 */

import { Application, MeshRope, Point, MeshRopeOptions, DestroyOptions } from 'pixi.js';
import { GetAngleBetweenVectorsDeg } from '../Geometry';

export class Trail {
    public readonly rope: MeshRope;
    /**
     * Array of points that make up the trail geometry
     * 
     * The first point is the TAIL, and the last point is the HEAD
     */
    protected trailGeometry: Point[];
    protected app: Application;
    protected updateCallback: () => void;

    /**
     * Point to which the trail should head towards
     */
    public goal: Point = new Point(0,0);
    /**
     * pixels/frame that the trail should travel towards `goal`, in both X and Y directions
     */
    public headSpeed: Point = new Point(10,10);
    /**
     * The amount of rotation necessary to create a new trail segment as the trail moves towards `goal`
     */
    public segmentationThresholdDeg: number = 10;
    /**
     * Speed at which the tail of the rope should shorten, in pixels/frame
     */
    public tailShorteningSpeed: number = 10;
    
    public get headPosition(): Point {
        return this.trailGeometry[this.trailGeometry.length - 1];
    }

    //TODO: cache and/or precompute
    public get trailLength(): number {
        return this.trailGeometry.reduce((acc, curr, idx) => {
            if (idx > 0) {
                return acc + this.trailGeometry[idx - 1].subtract(curr).magnitude();
            }
            return acc;
        }, 0);
    }

    public IsHeadAtRest(): boolean {
        return this.headPosition.subtract(this.goal).magnitudeSquared() < 1; //<1 unit = close enough
    }

    public GetDistanceToGoal(): number {
        return this.headPosition.subtract(this.goal).magnitude();
    }

    /**
     * Snaps the head of the trail to the given position immediately,
     * ignoring the `headSpeed` setting
     * 
     * @param pos - the position to snap the head to
     */
    public SnapHeadTo(pos: Point): void {
        this.MoveHeadTowardsGoal(pos, true);
    }

    public Clear(jumpToGoal: boolean = true): void {
        //clear all past trail segments,
        //and if the user so desires jump the head to the goal so that
        //the trail immediately "begins again" from the goal(once that goal moves again, that is)
        if (jumpToGoal) {
            this.trailGeometry.splice(0, this.trailGeometry.length);
            this.trailGeometry.push(this.goal.clone());
        } else {
            this.trailGeometry.splice(0, this.trailGeometry.length - 1);
        }

    }

    /**
     * moves `headPosition` towards `goal` by `speed`, adding a new point to `trailGeometry` if necessary
     * 
     * if `snap` is true, the head will be snapped to the given position immediately without
     * any delta time / speed influence
     */
    protected MoveHeadTowardsGoal(goalPos: Point = this.goal, snap: boolean = false): void {
        const curHeadPos = this.headPosition;
        const deltaPos = goalPos.subtract(curHeadPos);
        const movementTowardsGoalThisFrame = snap ? deltaPos : deltaPos.normalize().multiply(this.headSpeed.multiplyScalar(this.app.ticker.deltaTime));

        //if we're going to overshoot the goal on either axis,
        //we'll need to clamp the movement we apply this frame
        //to instead jump directly to the axis instead of oscillating
        if (!snap && (Math.abs(deltaPos.x) < Math.abs(movementTowardsGoalThisFrame.x) || Math.abs(deltaPos.y) < Math.abs(movementTowardsGoalThisFrame.y))) {
            const xOvershootsGoal = Math.abs(deltaPos.x) < Math.abs(movementTowardsGoalThisFrame.x);
            const yOvershootsGoal = Math.abs(deltaPos.y) < Math.abs(movementTowardsGoalThisFrame.y);
            movementTowardsGoalThisFrame.set(
                xOvershootsGoal ? deltaPos.x : movementTowardsGoalThisFrame.x,
                yOvershootsGoal ? deltaPos.y : movementTowardsGoalThisFrame.y
            );
        }

        const headSegmentBeginning: Point | undefined = this.trailGeometry[this.trailGeometry.length - 2];

        let shouldCreateNewPointForHead: boolean = false;
        if (headSegmentBeginning) {
            //the head is connected to a previous segment instead of
            //being the only point in the trailGeometry array
            //let's see if the angle is great enough that we need to
            //move at in order to create a new segment
            const deltaMovementSoFarThisSegment = curHeadPos.subtract(headSegmentBeginning);
            if (deltaMovementSoFarThisSegment.magnitudeSquared() === 0 || movementTowardsGoalThisFrame.magnitudeSquared() === 0) {
                //NaN prevention - if either vector is zero, we
                //need to make a new point if the head is not already at the
                //position that it's attempting to move towards
                shouldCreateNewPointForHead = !curHeadPos.equals(curHeadPos.add(movementTowardsGoalThisFrame));
            } else {
                const angleDiscrepancy = GetAngleBetweenVectorsDeg(deltaMovementSoFarThisSegment, movementTowardsGoalThisFrame);
                if (angleDiscrepancy > this.segmentationThresholdDeg) {
                    shouldCreateNewPointForHead = true;
                }
            }
        } else {
            //the head is not connected to a previous segment, so we need to create a new point for it regardless
            shouldCreateNewPointForHead = true;
        }

        if (shouldCreateNewPointForHead) {
            //we're creating a new segment; this just takes the form of
            //making trailGeometry longer
            this.trailGeometry.push(curHeadPos.add(movementTowardsGoalThisFrame));
        } else {
            //we're continuing the existing segment; this just takes the form of
            //updating the last point in the trailGeometry array's position
            curHeadPos.add(movementTowardsGoalThisFrame, this.trailGeometry[this.trailGeometry.length - 1]);
        }
    }

    /**
     * Shortens the tail of the trail by `tailShorteningSpeed` units
     * 
     * **this should only be called in the condition that `trailGeometry.length > 1`!**
     */
    protected ShortenTail(): void {
        let distToShorten: number = this.tailShorteningSpeed * this.app.ticker.deltaTime;
        const currentTrailLength: number = this.trailLength;

        if (currentTrailLength <= distToShorten) {
            //we're shortening the tail more than the actual trail length,
            //so we can just reduce the trail to 1 point; the head
            this.trailGeometry.splice(0, this.trailGeometry.length - 1);
            return;
        }
        //we're shortening the tail less than the actual trail length,
        //so we'll end up either moving the last point or removing some and moving the remaining last one
        //let's see which one that'll be
        while (distToShorten > 0) {
            //first two points are the 'last' trail segment since head gets appended onto end
            const lastTrailSegment: Point[] = this.trailGeometry.slice(0, 2);
            const segmentVec: Point = lastTrailSegment[1].subtract(lastTrailSegment[0]);
            const segmentLength: number = segmentVec.magnitude();
            if (segmentLength <= distToShorten) {
                //we're shortening the tail more than this segment's length,
                //so we'll simply remove the last point from the trailGeometry array
                //which will effectively 'remove' the last segment from the trail
                //and we'll go around the loop again to try the next segment with the remaining dist
                distToShorten -= segmentLength;
                this.trailGeometry.shift();
            } else {
                //we're shortening the tail less than this segment's length,
                //interpolate the *first* point in trailGeometry towards the second
                //point thus that the segment is shortened by the remaining
                //distance in distToShorten
                const amountToMoveTrailTailPoint: Point = segmentVec.normalize().multiplyScalar(distToShorten);
                this.trailGeometry[0].add(amountToMoveTrailTailPoint, this.trailGeometry[0]);
                break; //we're now done shortening the tail
            }
        }
    }

    protected UpdateTrail() {
        const distanceToGoal = this.GetDistanceToGoal();

        //first, process head movement towards goal if needed
        if (distanceToGoal > 1) {
            this.MoveHeadTowardsGoal();
        }

        //next, update the tail of the rope to shorten it
        //can only shorten it if there's actually a point to shorten into the head though
        if (this.trailGeometry.length > 1) {
            this.ShortenTail();
        }
    }

    constructor(app: Application, startingPosition: Point, ropeOptions: Omit<MeshRopeOptions, 'points'>) {
        this.trailGeometry = [startingPosition.clone()];
        this.rope = new MeshRope({
            ...ropeOptions,
            points: this.trailGeometry
        });
        this.app = app;
        
        app.stage.addChild(this.rope);

        this.updateCallback = () => this.UpdateTrail();
        app.ticker.add(this.updateCallback);
    }

    public destroy(destroyRopeOptions: DestroyOptions = { children: true, textureSource: false }): void {
        if (this.updateCallback && this.app && this.app.ticker) {
            this.app.ticker.remove(this.updateCallback);
        }
        if (this.rope) { //rope is readonly *but* pixi.js can remove descendants if parent gets removed
            this.rope.removeFromParent();
            this.rope.destroy(destroyRopeOptions);
        }
    }
}