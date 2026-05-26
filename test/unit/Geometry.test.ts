import { describe, expect, test } from 'vitest';
import type { Point } from 'pixi.js';
import {
	Deg2Rad,
	GetAngleBetweenVectorsDeg,
	GetAngleBetweenVectorsRad,
	GetAngleOfVectorDeg,
	GetAngleOfVectorRad,
	LerpVector,
	Rad2Deg,
	SlerpVector,
} from '../../src/EffectLib/Bloom/Geometry/Geometry';
import { MockPoint } from '../helpers/MockPoint';

/**
 * Geometry.ts uses `import type { Point }` - the type is erased at runtime.
 * MockPoint is cast to `Point` here for the same reason it works in production:
 * the geometry functions only care about the structural interface, not the
 * nominal PixiJS type.
 */
function pt(x: number, y: number): Point {
	return new MockPoint(x, y) as unknown as Point;
}

//Angle conversions

describe('Rad2Deg', () => {
	test('π radians -> 180°', () => {
		expect(Rad2Deg(Math.PI)).toBeCloseTo(180, 10);
	});

	test('0 radians -> 0°', () => {
		expect(Rad2Deg(0)).toBe(0);
	});

	test('π/2 radians -> 90°', () => {
		expect(Rad2Deg(Math.PI / 2)).toBeCloseTo(90, 10);
	});
});

describe('Deg2Rad', () => {
	test('180° -> π radians', () => {
		expect(Deg2Rad(180)).toBeCloseTo(Math.PI, 10);
	});

	test('0° -> 0 radians', () => {
		expect(Deg2Rad(0)).toBe(0);
	});

	test('Rad2Deg and Deg2Rad are inverses', () => {
		expect(Rad2Deg(Deg2Rad(90))).toBeCloseTo(90, 10);
		expect(Deg2Rad(Rad2Deg(Math.PI / 4))).toBeCloseTo(Math.PI / 4, 10);
	});
});

//Vector angle

describe('GetAngleBetweenVectorsRad', () => {
	test('perpendicular unit vectors -> π/2', () => {
		expect(GetAngleBetweenVectorsRad(pt(1, 0), pt(0, 1))).toBeCloseTo(Math.PI / 2, 10);
	});

	test('parallel vectors -> 0', () => {
		expect(GetAngleBetweenVectorsRad(pt(1, 0), pt(2, 0))).toBeCloseTo(0, 10);
	});

	test('anti-parallel vectors -> π', () => {
		expect(GetAngleBetweenVectorsRad(pt(1, 0), pt(-1, 0))).toBeCloseTo(Math.PI, 10);
	});

	test('throws when v1 is the zero vector', () => {
		expect(() => GetAngleBetweenVectorsRad(pt(0, 0), pt(1, 0))).toThrow();
	});

	test('throws when v2 is the zero vector', () => {
		expect(() => GetAngleBetweenVectorsRad(pt(1, 0), pt(0, 0))).toThrow();
	});
});

describe('GetAngleBetweenVectorsDeg', () => {
	test('perpendicular vectors -> 90°', () => {
		expect(GetAngleBetweenVectorsDeg(pt(1, 0), pt(0, 1))).toBeCloseTo(90, 10);
	});

	test('anti-parallel vectors -> 180°', () => {
		expect(GetAngleBetweenVectorsDeg(pt(3, 0), pt(-1, 0))).toBeCloseTo(180, 10);
	});
});

describe('GetAngleOfVectorRad', () => {
	test('positive X axis -> 0', () => {
		expect(GetAngleOfVectorRad(pt(1, 0))).toBeCloseTo(0, 10);
	});

	test('positive Y axis -> π/2', () => {
		expect(GetAngleOfVectorRad(pt(0, 1))).toBeCloseTo(Math.PI / 2, 10);
	});

	test('negative X axis -> π (or -π, same angle)', () => {
		const angle = GetAngleOfVectorRad(pt(-1, 0));
		expect(Math.abs(angle)).toBeCloseTo(Math.PI, 10);
	});

	test('throws for the zero vector', () => {
		expect(() => GetAngleOfVectorRad(pt(0, 0))).toThrow();
	});
});

describe('GetAngleOfVectorDeg', () => {
	test('positive X axis -> 0°', () => {
		expect(GetAngleOfVectorDeg(pt(1, 0))).toBeCloseTo(0, 10);
	});

	test('positive Y axis -> 90°', () => {
		expect(GetAngleOfVectorDeg(pt(0, 2))).toBeCloseTo(90, 10);
	});
});

//LerpVector

describe('LerpVector', () => {
	test('t=0 -> returns the start point', () => {
		const result = LerpVector(pt(1, 2), pt(3, 4), 0);
		expect(result.x).toBeCloseTo(1, 10);
		expect(result.y).toBeCloseTo(2, 10);
	});

	test('t=1 -> returns the end point', () => {
		const result = LerpVector(pt(1, 2), pt(3, 4), 1);
		expect(result.x).toBeCloseTo(3, 10);
		expect(result.y).toBeCloseTo(4, 10);
	});

	test('t=0.5 -> returns the midpoint', () => {
		const result = LerpVector(pt(0, 0), pt(2, 4), 0.5);
		expect(result.x).toBeCloseTo(1, 10);
		expect(result.y).toBeCloseTo(2, 10);
	});

	test('lerp is linear - t=0.25 is ¼ of the way from a to b', () => {
		const result = LerpVector(pt(0, 0), pt(4, 8), 0.25);
		expect(result.x).toBeCloseTo(1, 10);
		expect(result.y).toBeCloseTo(2, 10);
	});
});

//SlerpVector

describe('SlerpVector', () => {
	test('zero vector for a falls back to lerp', () => {
		// a is zero -> aMag === 0 -> fallback to LerpVector(a, b, t)
		const result = SlerpVector(pt(0, 0), pt(2, 2), 0.5);
		expect(result.x).toBeCloseTo(1, 10);
		expect(result.y).toBeCloseTo(1, 10);
	});

	test('zero vector for b falls back to lerp', () => {
		const result = SlerpVector(pt(2, 2), pt(0, 0), 0.5);
		expect(result.x).toBeCloseTo(1, 10);
		expect(result.y).toBeCloseTo(1, 10);
	});

	test('t=0 on perpendicular unit vectors returns a direction near a', () => {
		// slerp at t=0: coeffA=1, coeffB=0 -> direction is aNorm -> (1,0)
		const result = SlerpVector(pt(1, 0), pt(0, 1), 0);
		expect(result.x).toBeCloseTo(1, 5);
		expect(result.y).toBeCloseTo(0, 5);
	});

	test('t=1 on perpendicular unit vectors returns a direction near b', () => {
		const result = SlerpVector(pt(1, 0), pt(0, 1), 1);
		expect(result.x).toBeCloseTo(0, 5);
		expect(result.y).toBeCloseTo(1, 5);
	});

	test('t=0.5 on perpendicular unit vectors gives the 45° diagonal (slerp on unit circle)', () => {
		const result = SlerpVector(pt(1, 0), pt(0, 1), 0.5);
		const expected = Math.SQRT2 / 2; // sin(π/4) = cos(π/4)
		expect(result.x).toBeCloseTo(expected, 5);
		expect(result.y).toBeCloseTo(expected, 5);
	});

	test('result of slerp between unit vectors at t=0.5 has unit magnitude', () => {
		const result = SlerpVector(pt(1, 0), pt(0, 1), 0.5);
		const mag = Math.sqrt(result.x * result.x + result.y * result.y);
		expect(mag).toBeCloseTo(1, 5);
	});
});
