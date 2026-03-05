/**
 * Bloom: The VSBloom Client's 'All-Purpose' Utility Container
 */

/// <reference lib="dom" />

import * as configs from './Configs';
import * as dom from './DOM';
import * as geometry from './Geometry/Geometry';
import * as janitors from './Janitors';
import * as vfx from './VFX/BloomVFX';

const bloom = {
	dom,
	configs,
	janitors,
	geometry,
	vfx: vfx.default,
};

export default bloom;
