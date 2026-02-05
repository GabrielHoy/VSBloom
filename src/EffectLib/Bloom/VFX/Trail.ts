/**
 * An implementation of a Trail effect class for VSBloom,
 * intended to be used as a basic implementation layer
 * to provide common trail-ish functionality for effects
 * to then build upon in their own specific ways.
 * 
 * Utilizes PixiJS's MeshRope class for trail rendering.
 */

import { Application, MeshRope, Point, MeshRopeOptions, DestroyOptions, RopeGeometry } from 'pixi.js';
import { Deg2Rad, GetAngleBetweenVectorsDeg, GetAngleOfVectorRad, LerpVector, Rad2Deg, SlerpVector } from '../Geometry/Geometry';

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
    public headSpeed: Point = new Point(20,20);
    /**
     * The amount of angular change that can be applied to
     * the trail as it angles itself to move towards `goal`
     * every frame, in degrees
     */
    public maxAngleChangePerFrameDeg: number = 5;
    /**
     * The distance from the goal that the trail head should
     * begin to slow down at while approaching the actual goal
     * while it is being constrained by the `maxAngleChangePerFrameDeg` constraint,
     * in pixels.
     * 
     * This helps prevent the trail from overshooting the goal
     * due to angular movement constraints such as
     * the `maxAngleChangePerFrameDeg` constraint.
     * 
     * *0 disables this feature.*
     */
    public proximityToGoalWhenAngularlyConstrainedForSlowdown: number = 100;
    /**
     * Speed at which the tail of the rope should shorten, in pixels/frame
     */
    public tailShorteningSpeed: number = 7.5;
    /**
     * Max trail length, in pixels.
     * 
     * *-1 unbounds this value.*
     */
    public maxTrailLength: number = -1;

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
     * Snaps the head of the trail to the given position immediately.
     */
    public SnapHeadTo(pos: Point, shouldUpdateGoal: boolean = true, moveExistingHeadInsteadOfAddingNewPoint: boolean = false): void {
        if (shouldUpdateGoal) {
            pos.copyTo(this.goal);
        }
        if (moveExistingHeadInsteadOfAddingNewPoint) {
            pos.copyTo(this.trailGeometry[this.trailGeometry.length - 1]);
            return;
        } else {
            this.trailGeometry.push(pos.clone());
        }

        this.TrailGeometryUpdated();
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
        
        this.TrailGeometryUpdated();
    }

    protected TrailGeometryUpdated(): void {
        const hasEnoughPointsToMeaningfullyRender = this.trailGeometry.length >= 2;
        
        this.rope.visible = hasEnoughPointsToMeaningfullyRender;
        if (hasEnoughPointsToMeaningfullyRender) {
            (this.rope.geometry as RopeGeometry).update();
        }
    }

    /**
     * moves `headPosition` towards `goal` by `speed`, adding a new point to `trailGeometry` if necessary
     * 
     * if `snap` is true, the head will be snapped to the given position immediately without
     * any delta time / speed influence
     * 
     * Should return true if there was any change to the trail geometry
     * this frame (regardless of where that update occurred on the geometry array).
     */
    protected MoveHeadTowardsGoal(goalPos: Point = this.goal): boolean {
        const curHeadPos = this.headPosition;
        const curHeadPosToGoal = goalPos.subtract(curHeadPos);
        const headMovementThisFrame = curHeadPosToGoal.normalize().multiply(this.headSpeed.multiplyScalar(this.app.ticker.deltaTime));

        const xOvershootsGoal = Math.abs(curHeadPosToGoal.x) < Math.abs(headMovementThisFrame.x);
        const yOvershootsGoal = Math.abs(curHeadPosToGoal.y) < Math.abs(headMovementThisFrame.y);
        if (xOvershootsGoal || yOvershootsGoal) {
            //if we're going to overshoot the goal on either axis,
            //we'll need to clamp the movement we apply this frame
            //to instead jump directly to the axis instead of oscillating
            headMovementThisFrame.set(
                xOvershootsGoal ? curHeadPosToGoal.x : headMovementThisFrame.x,
                yOvershootsGoal ? curHeadPosToGoal.y : headMovementThisFrame.y
            );
        }
        
        if (headMovementThisFrame.magnitudeSquared() === 0) {
            //there's...no movement this frame. OK.
            return false;
        }

        const currentSegmentBeginning: Point | undefined = this.trailGeometry[this.trailGeometry.length - 2];
        if (!currentSegmentBeginning) {
            //if there's no "second to last" point in the trailGeometry array,
            //we need to create a new point for the head since the array
            //only has one point in it so far
            this.trailGeometry.push(curHeadPos.add(headMovementThisFrame));
            return true;
        }

        //at this point, we at least know that there's two points
        //in the trailGeometry array and thus a "segment" exists
        const currentSegmentVec = curHeadPos.subtract(currentSegmentBeginning);

        if (currentSegmentVec.magnitudeSquared() === 0) {
            //NaN prevention, somehow the head segment vector
            //is a zero vector, so the 'head segment' is
            //infinitely small...there's pros/cons to creating a new
            //point here vs. just moving the head segment to lengthen
            //this segment, but for now we'll make a new point
            
            //This could result in tons of points stacking up
            //IF we hadn't already established that `headMovementThisFrame`
            //was non-zero, but since we've done that this should be fine
            this.trailGeometry.push(curHeadPos.add(headMovementThisFrame));
            return true;
        }

        //We can now have a meaningful 'angle delta' from the last to new head segment

        //Let's start on solving for constraints

        //Make sure moving this head segment's end point won't cause the
        //angle between these two segments to exceed the `maxAngleBetweenSegments`
        //constraint

        //if we were to move the head segment to the post-update position
        //without any constraints here, what would the angle delta be
        //between the previous segment and the head segment?
        const currentSegmentAngle = GetAngleOfVectorRad(currentSegmentVec);
        const unconstrainedNewSegmentAngle = GetAngleOfVectorRad(headMovementThisFrame);

        const maxSegmentAngleDeltaConstraint = Deg2Rad(this.maxAngleChangePerFrameDeg);
        let segmentAngleDelta = unconstrainedNewSegmentAngle - currentSegmentAngle;
        //need to normalize this delta to -pi/pi since either curSegAnge or unconNewSegAngle
        //could be on the opposite "side" of the circle causing a large angle delta
        segmentAngleDelta = Math.atan2(Math.sin(segmentAngleDelta), Math.cos(segmentAngleDelta));

        if (Math.abs(segmentAngleDelta) > maxSegmentAngleDeltaConstraint) {
            //Moving the head the amount we want to would
            //cause the two segment angles to differ too much,
            //we'll clamp the movement that we apply this frame
            //as to only move the head segment such that the
            //angle delta between the two segments becomes exactly `maxAngleBetweenSegments`,
            
            //This will implicitly result in the head "re-adjusting" its
            //angle visually along an arc during significant changes in goal position
            //compared to the current head position and previous segment directions
            const clampedAngleDelta = maxSegmentAngleDeltaConstraint * Math.sign(segmentAngleDelta);
            const constrainedAngleForNewSegment = currentSegmentAngle + clampedAngleDelta;
            const newSegmentLength = headMovementThisFrame.magnitude();

            let constrainedNewSegmentVec = new Point(
                Math.cos(constrainedAngleForNewSegment) * newSegmentLength,
                Math.sin(constrainedAngleForNewSegment) * newSegmentLength
            );

            //we now have the constrained new segment vector,
            //BUT we have one issue: when the head gets very close
            //to the goal while being constrained by the max angle change,
            //it could end up not being able to angle itself fast enough
            //to actually *reach* the goal.
            //Sometimes this results in
            //quite a pretty "loop around" as it goes in a circle and
            //ultimately to the goal...Sometimes that loop-around
            //never ends and the head just goes in a perfect,
            //infinite circle around the goal until the goal moves again.
            if (this.proximityToGoalWhenAngularlyConstrainedForSlowdown > 0) {
                const proximityMultiplier = Math.min(1, curHeadPosToGoal.magnitude() / this.proximityToGoalWhenAngularlyConstrainedForSlowdown);
                constrainedNewSegmentVec.multiplyScalar(proximityMultiplier, constrainedNewSegmentVec);
            }

            const toGoalDir = curHeadPosToGoal.normalize();
            const progressTowardGoal = constrainedNewSegmentVec.dot(toGoalDir);
            if (progressTowardGoal > 0) {
                const movementMag = constrainedNewSegmentVec.magnitude();
                if (movementMag > progressTowardGoal) {
                    constrainedNewSegmentVec = constrainedNewSegmentVec.normalize().multiplyScalar(progressTowardGoal);
                }
            }

            //now that we've derived the constrained post-update head segment vector,
            //we can update the "movement this frame" vector accordingly
            constrainedNewSegmentVec.copyTo(headMovementThisFrame);
        }

        //Done with constraints!

        //We're creating a new point for the head segment; this just takes the form of
        //making trailGeometry longer and will establish the beginning of a new segment
        //TODO: Come back and optimize this so that if the movement this frame lies
        //TODO: along the same direction as the current segment we lengthen that
        //TODO: segment instead of creating a new point for the head
        this.trailGeometry.push(curHeadPos.add(headMovementThisFrame));

        //at this point we would have modified the trail geometry array,
        //so we'll return true accordingly to indicate that
        return true;
    }

    /**
     * Shortens the tail of the trail by `tailShorteningSpeed` units
     * 
     * **this should only be called in the condition that `trailGeometry.length > 1`!**
     * 
     * Should return true if there was any change to the trail geometry
     * this frame (regardless of where that update occurred on the geometry array).
     */
    protected ShortenTail(): boolean {
        let distToShorten: number = this.tailShorteningSpeed * this.app.ticker.deltaTime;
        const currentTrailLength: number = this.trailLength;

        if (currentTrailLength === 0) {
            //if the current trail length is zero, there's nothing to really shorten
            return false;
        }

        
        //if the trail length exceeds the max trail length,
        //we'll need to shorten the trail to match the max trail length
        //(that is, if this shortening wouldn't do that already!)
        if (this.maxTrailLength > 0 && (currentTrailLength - distToShorten) > this.maxTrailLength) {
            //even after our shortening, the trail length would
            //exceed its maximum - we'll set how much we want
            //to shorten the trail to the difference between
            //the current trail length and the max trail length
            //so that we "eat" the excess trail length instantly
            //instead of just shortening the trail by the 'shortening speed'
            distToShorten = currentTrailLength - this.maxTrailLength;
        }

        if (currentTrailLength <= distToShorten) {
            //we're shortening the tail more than the actual trail length,
            //so we can just reduce the trail to 1 point; the head
            this.trailGeometry.splice(0, this.trailGeometry.length - 1);
            return true;
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

        return true;
    }

    protected UpdateTrail() {
        const distanceToGoal = this.GetDistanceToGoal();
        let updatedTrailGeometryThisFrame: boolean = false;

        //first, process head movement towards goal if needed
        if (distanceToGoal > 1) {
            updatedTrailGeometryThisFrame = this.MoveHeadTowardsGoal();
        }

        //next, update the tail of the rope to shorten it
        //can only shorten it if there's actually a point to shorten into the head though
        if (this.trailGeometry.length > 1) {
            const didTailShorteningAffectGeometry: boolean = this.ShortenTail();
            updatedTrailGeometryThisFrame = updatedTrailGeometryThisFrame || didTailShorteningAffectGeometry;
        }

        //if anything in the trail geometry was updated this frame,
        //we need to update the rope's geometry to match
        if (updatedTrailGeometryThisFrame) {
            this.TrailGeometryUpdated();
        }
    }

    constructor(app: Application, startingPosition: Point, ropeOptions: Omit<MeshRopeOptions, 'points'>) {
        this.trailGeometry = [startingPosition.clone()];
        this.goal = startingPosition.clone();
        this.rope = new MeshRope({
            ...ropeOptions,
            points: this.trailGeometry
        });
        this.rope.visible = false;
        this.rope.autoUpdate = false;
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