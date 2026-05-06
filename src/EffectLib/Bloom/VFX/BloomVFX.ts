/**
 * BloomVFX - VSBloom's Visual Effect Class Library
 */

/// <reference lib="dom" />

import * as Trails from './Trail';
import * as TrailTargets from './TrailTarget';

const BloomVFX = {
	trails: { ...Trails, ...TrailTargets },
};

export default BloomVFX;
