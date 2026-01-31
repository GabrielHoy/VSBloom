import type { Point } from "pixi.js";

export function Rad2Deg(radians: number): number {
    return radians * (180 / Math.PI);
}

export function Deg2Rad(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Returns the angle between two vectors, in radians
 * 
 * @param v1 - The first vector
 * @param v2 - The second vector
 * @returns The angle between the two vectors, in radians
 */
export function GetAngleBetweenVectorsRad(v1: Point, v2: Point): number {
    if (v1.magnitudeSquared() === 0 || v2.magnitudeSquared() === 0) {
        throw new Error(`Attempt to get the angle - in radians - between two vectors where vector ${v1.magnitudeSquared() === 0 ? '(v1)' : '(v2)'} is a zero vector: This would result in a division by zero/NaN value.`);
    }
    return Math.acos(v1.dot(v2) / (v1.magnitude() * v2.magnitude()));
}

/**
 * Returns the angle between two vectors, in degrees
 * 
 * @param v1 - The first vector
 * @param v2 - The second vector
 * @returns The angle between the two vectors, in degrees
 */
export function GetAngleBetweenVectorsDeg(v1: Point, v2: Point): number {
    if (v1.magnitudeSquared() === 0 || v2.magnitudeSquared() === 0) {
        throw new Error(`Attempt to get the angle - in degrees - between two vectors where vector ${v1.magnitudeSquared() === 0 ? '(v1)' : '(v2)'} is a zero vector: This would result in a division by zero/NaN value.`);
    }
    return Rad2Deg(GetAngleBetweenVectorsRad(v1, v2));
}