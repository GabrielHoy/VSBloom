/**
 * Minimal PixiJS Point stand-in for unit tests.
 *
 * Geometry.ts uses `import type { Point }` - the import is erased at runtime.
 * At runtime the geometry functions work on whatever object is passed in, using
 * the constructor of `a` to produce new instances (for SlerpVector). As long as
 * this class matches the PixiJS Point surface used by Geometry.ts, all tests
 * can run without importing pixi.js itself.
 *
 * Mutation semantics mirror PixiJS v8:
 *   multiplyScalar -> mutates self, returns self
 *   add / subtract / clone / normalize -> return a new MockPoint
 */
export class MockPoint {
	public x: number;
	public y: number;

	public constructor(x: number = 0, y: number = 0) {
		this.x = x;
		this.y = y;
	}

	public magnitude(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}

	public magnitudeSquared(): number {
		return this.x * this.x + this.y * this.y;
	}

	public dot(other: MockPoint): number {
		return this.x * other.x + this.y * other.y;
	}

	public add(other: MockPoint): MockPoint {
		return new MockPoint(this.x + other.x, this.y + other.y);
	}

	public subtract(other: MockPoint): MockPoint {
		return new MockPoint(this.x - other.x, this.y - other.y);
	}

	/** Mutates self (matches PixiJS v8 behavior) and returns self. */
	public multiplyScalar(scalar: number): MockPoint {
		this.x *= scalar;
		this.y *= scalar;
		return this;
	}

	public clone(): MockPoint {
		return new MockPoint(this.x, this.y);
	}

	public normalize(): MockPoint {
		const mag = this.magnitude();
		if (mag === 0) {
			return new MockPoint(0, 0);
		}
		return new MockPoint(this.x / mag, this.y / mag);
	}
}
