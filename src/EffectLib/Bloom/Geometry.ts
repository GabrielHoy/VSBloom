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
        throw new Error(`Attempt to get the angle between two vectors where vector ${v1.magnitudeSquared() === 0 ? '(v1)' : '(v2)'} is a zero vector: This would result in a division by zero/NaN value.`);
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
    return Rad2Deg(GetAngleBetweenVectorsRad(v1, v2));
}

/**
 * Linear interpolation - lerp - between two PixiJS Point vectors.
 * Returns a point on the line between a and b, with interpolation t (0 to 1).
 *
 * @param a - The starting point/vector
 * @param b - The target point/vector
 * @param t - The interpolation amount (0=start, 1=end)
 * @returns A new Point instance at the interpolated location
 */
export function LerpVector(a: Point, b: Point, t: number): Point {
    return a.add(b.subtract(a).multiplyScalar(t));
}

/**
 * Spherical linear interpolation - 'slerp' - between two PixiJS Point vectors.
 * Returns a point on the arc between a and b, with interpolation t (0 to 1).
 *
 * @param a - The starting point/vector
 * @param b - The target point/vector
 * @param t - The interpolation amount (0=start, 1=end)
 * @returns A new Point instance at the interpolated location
 */
export function SlerpVector(a: Point, b: Point, t: number): Point {
    // If a or b is a zero vector, fallback to lerp since direction can't be determined
    const aMag = a.magnitude();
    const bMag = b.magnitude();

    if (aMag === 0 || bMag === 0) {
        // Fallback to simple lerp
        return LerpVector(a, b, t);
    }

    // Normalize both vectors
    const aNorm = a.clone().multiplyScalar(1 / aMag);
    const bNorm = b.clone().multiplyScalar(1 / bMag);

    // Compute the cosine of the angle between aNorm and bNorm
    let dot = aNorm.dot(bNorm);
    // Clamp for numerical safety
    dot = Math.min(Math.max(dot, -1.0), 1.0);

    const theta = Math.acos(dot);

    // If theta is very small, the points are nearly identical; fallback to lerp
    if (theta < 1e-6) {
        // Interpolate between magnitudes
        const mag = aMag + (bMag - aMag) * t;
        return aNorm.multiplyScalar(mag);
    }

    // Slerp formula for 2D points
    // Compute the interpolation coefficients
    const sinTheta = Math.sin(theta);
    const coeffA = Math.sin((1 - t) * theta) / sinTheta;
    const coeffB = Math.sin(t * theta) / sinTheta;

    // Interpolate directions on the unit circle
    const x = aNorm.x * coeffA + bNorm.x * coeffB;
    const y = aNorm.y * coeffA + bNorm.y * coeffB;

    // Interpolate magnitudes linearly (for most slerp implementations)
    const mag = aMag + (bMag - aMag) * t;
    return new (a.constructor as typeof Point)(x * mag, y * mag);
}

/**
 * Takes a vector and returns the angle of that vector relative to the positive X axis.
 * 
 * @param v - The vector to get the angle of
 * @returns The angle of the vector relative to the positive X axis, in **radians**
 */
export function GetAngleOfVectorRad(v: Point): number {
    if (v.magnitudeSquared() === 0) {
        throw new Error(`Attempt to get the angle of a zero-vector: This would result in NaN.`);
    }
    const normalized = v.normalize();
    return Math.atan2(normalized.y, normalized.x);
}

/**
 * Takes a vector and returns the angle of that vector relative to the positive X axis.
 * 
 * @param v - The vector to get the angle of
 * @returns The angle of the vector relative to the positive X axis, in **degrees**
 */
export function GetAngleOfVectorDeg(v: Point): number {
    return Rad2Deg(GetAngleOfVectorRad(v));
}