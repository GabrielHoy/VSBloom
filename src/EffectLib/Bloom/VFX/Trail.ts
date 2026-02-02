/**
 * An implementation of a Trail effect class for VSBloom,
 * intended to be used as a basic implementation layer
 * to provide common trail-ish functionality for effects
 * to then build upon in their own specific ways.
 * 
 * Utilizes PixiJS's MeshRope class for trail rendering.
 */

import { Application, MeshRope, Point, MeshRopeOptions, DestroyOptions, RopeGeometry } from 'pixi.js';
import { Deg2Rad, GetAngleBetweenVectorsDeg, GetAngleOfVectorRad, LerpVector, Rad2Deg, SlerpVector } from '../Geometry';

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
     * The amount of rotation necessary to create a new trail segment as the trail moves towards `goal`
     */
    public maxAngleBetweenSegmentsDeg: number = 1;
    /**
     * Speed at which the tail of the rope should shorten, in pixels/frame
     */
    public tailShorteningSpeed: number = 7.5;
    
    
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

        //if we're going to overshoot the goal on either axis,
        //we'll need to clamp the movement we apply this frame
        //to instead jump directly to the axis instead of oscillating
        if (Math.abs(curHeadPosToGoal.x) < Math.abs(headMovementThisFrame.x) || Math.abs(curHeadPosToGoal.y) < Math.abs(headMovementThisFrame.y)) {
            const xOvershootsGoal = Math.abs(curHeadPosToGoal.x) < Math.abs(headMovementThisFrame.x);
            const yOvershootsGoal = Math.abs(curHeadPosToGoal.y) < Math.abs(headMovementThisFrame.y);
            headMovementThisFrame.set(
                xOvershootsGoal ? curHeadPosToGoal.x : headMovementThisFrame.x,
                yOvershootsGoal ? curHeadPosToGoal.y : headMovementThisFrame.y
            );
        }
        
        if (headMovementThisFrame.magnitudeSquared() === 0) {
            //there's...no movement this frame. OK.
            return false;
        }

        const headSegmentBeginning: Point | undefined = this.trailGeometry[this.trailGeometry.length - 2];
        if (!headSegmentBeginning) {
            //if there's no "second to last" point in the trailGeometry array,
            //we need to create a new point for the head since the array
            //only has one point in it so far
            this.trailGeometry.push(curHeadPos.add(headMovementThisFrame));
            return true;
        }

        //at this point, we at least know that there's two points
        //in the trailGeometry array and thus a "segment" exists
        const preUpdateHeadSegmentVec = curHeadPos.subtract(headSegmentBeginning);

        if (preUpdateHeadSegmentVec.magnitudeSquared() === 0) {
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

        //let's see if there was a 'previous segment' before this 'head' segment
        const previousSegmentBeginning: Point | undefined = this.trailGeometry[this.trailGeometry.length - 3];
        if (!previousSegmentBeginning) {
            //This is the first segment in the trail
            //due to our geometry array having no orientation
            //info paired with each point, we can't meaningfully
            //know how "much" the head segment has moved without
            //tracking its first ever vector upon creation of
            //the second point in the array: that would be messy
            //so for now we'll just create a new point for the head
            
            //This will establish a "two segment" trail geometry array
            //which will allow us to properly calculate angles between
            //segments going forward
            this.trailGeometry.push(curHeadPos.add(headMovementThisFrame));
            return true;
        }
        const previousSegmentVec = headSegmentBeginning.subtract(previousSegmentBeginning);

        //one last check to make before angle geometries:
        //is the previous segment vector a zero vector?
        if (previousSegmentVec.magnitudeSquared() === 0) {
            //Nan prevention, for some reason the previous segment
            //to the head segment is a zero vector.
            //Create a new point for the head segment.
            this.trailGeometry.push(curHeadPos.add(headMovementThisFrame));
            return true;
        }

        //We can now have a meaningful 'angle delta' from the last to current segment

        let shouldCreateNewPointForHeadInsteadOfChangingExistingSegment = false;
        //Let's start on solving for constraints

        //Let's make sure moving this head segment's end point won't cause the
        //angle between these two segments to exceed the `maxAngleBetweenSegments`
        //constraint
        let postUpdateHeadPos = curHeadPos.add(headMovementThisFrame);
        let postUpdateHeadSegmentVec = postUpdateHeadPos.subtract(headSegmentBeginning);

        //if we were to move the head segment to the post-update position
        //without any constraints here, what would the angle delta be
        //between the previous segment and the head segment?
        const previousSegmentAngle = GetAngleOfVectorRad(previousSegmentVec);
        const unconstrainedPostUpdateHeadSegmentAngle = GetAngleOfVectorRad(postUpdateHeadSegmentVec);
        let unconstrainedSegmentAngleDelta = unconstrainedPostUpdateHeadSegmentAngle - previousSegmentAngle;
        unconstrainedSegmentAngleDelta = Math.atan2(Math.sin(unconstrainedSegmentAngleDelta), Math.cos(unconstrainedSegmentAngleDelta)); //Wrap the angle delta to be between -PI and PI

        const maxSegmentAngleDeltaConstraint = Deg2Rad(this.maxAngleBetweenSegmentsDeg);
        if (Math.abs(unconstrainedSegmentAngleDelta) > maxSegmentAngleDeltaConstraint) {
            //Moving the head the amount we want to would
            //cause the two segment angles to differ too much,
            //we'll clamp the movement that we apply this frame
            //as to only move the head segment such that the
            //angle delta between the two segments becomes exactly `maxAngleBetweenSegments`,
            
            //This will implicitly result in the head "re-adjusting" its
            //angle visually along an arc during significant changes in goal position
            //compared to the current head position and previous segment directions
            const rotationFromPreviousSegmentAngleToGetNewSegmentConstrainedAngle = (maxSegmentAngleDeltaConstraint * Math.sign(unconstrainedSegmentAngleDelta));
            const constrainedRotPercentOfUnconstrained = maxSegmentAngleDeltaConstraint / Math.abs(unconstrainedSegmentAngleDelta);
            const constrainedHeadSegLength = preUpdateHeadSegmentVec.magnitude() * constrainedRotPercentOfUnconstrained;

            const prevSegmentRotatedToMatchConstrainedSegAngle = previousSegmentVec.rotate(rotationFromPreviousSegmentAngleToGetNewSegmentConstrainedAngle);
            const constrainedPostUpdateHeadSegmentVec = 
                prevSegmentRotatedToMatchConstrainedSegAngle.normalize()
                .multiplyScalar(constrainedHeadSegLength);

            //now that we've derived the constrained post-update head segment vector,
            //we can update the "to apply" head pos and the head segment vector accordingly
            headSegmentBeginning.add(constrainedPostUpdateHeadSegmentVec, postUpdateHeadPos);
            constrainedPostUpdateHeadSegmentVec.copyTo(postUpdateHeadSegmentVec);

            shouldCreateNewPointForHeadInsteadOfChangingExistingSegment = true;
        }

        //Done with constraints!

        if (!shouldCreateNewPointForHeadInsteadOfChangingExistingSegment) {
            //Nothing so far has actively indicated that we *need* to create
            //a new point for the head segment here, but the deciding factor
            //in that ultimately is whether the current segment matches
            //the proposed new segment in their angles; if they have
            //different angles then in order to not lose the trail's "curve"
            //movement we'll have to create a new point for the head segment

            const angleBetweenPreAndPostUpdateHeadSegment = GetAngleBetweenVectorsDeg(preUpdateHeadSegmentVec, postUpdateHeadSegmentVec);
            if (angleBetweenPreAndPostUpdateHeadSegment > 1) {
                //If we were to just move the head point and change the head segment,
                //we'd be actively causing the entire segment to change its angle:
                //This case requires the creation of a new point for the head segment
                //instead of simply lengthening the existing segment
                shouldCreateNewPointForHeadInsteadOfChangingExistingSegment = true;
            } else {
                //The angle matches between the pre and post-update head segment,
                //but we need to make sure the segment length can only increase
                //and can't decrease due to point count optimization like this;
                //so if the post-update magnitude is less than the pre-update magnitude,
                //we'll need to create a new point anyways
                if (postUpdateHeadSegmentVec.magnitudeSquared() < preUpdateHeadSegmentVec.magnitudeSquared()) {
                    shouldCreateNewPointForHeadInsteadOfChangingExistingSegment = true;
                }
            }
        }

        if (shouldCreateNewPointForHeadInsteadOfChangingExistingSegment) {
            //We're creating a new point for the head segment; this just takes the form of
            //making trailGeometry longer and will establish the beginning of a new segment
            this.trailGeometry.push(postUpdateHeadPos);
        } else {
            //We're modifying the existing segment, which in theory should only happen
            //when there are no changes angularly to the segment and we're just
            //lengthening it -- let's just update the last point in the trailGeometry array
            //so that the "head" segment's end point is the post-update head pos
            postUpdateHeadPos.copyTo(this.trailGeometry[this.trailGeometry.length - 1]);
        }

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

        console.debug(this.trailGeometry.length);
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