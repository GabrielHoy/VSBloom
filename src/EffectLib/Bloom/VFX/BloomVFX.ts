/**
 * BloomVFX - VSBloom's Visual Effect Class Library
 */

/// <reference lib="dom" />

import * as Dots from './Dot';
import * as Trails from './Trail';
import * as TrailTargets from './TrailTarget';

const BloomVFX = {
	trails: { ...Trails, ...TrailTargets },
	dots: Dots,
};

export default BloomVFX;
