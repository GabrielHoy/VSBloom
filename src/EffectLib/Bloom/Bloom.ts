/**
 * Bloom: The VSBloom Client's 'All-Purpose' Utility Container
 */

/// <reference lib="dom" />

import * as dom from './DOM'; 
import * as configs from './Configs';
import * as janitors from './Janitors';
import * as geometry from './Geometry';
import * as vfx from './VFX/BloomVFX';

const bloom = {
    dom,
    configs,
    janitors,
    geometry,
    vfx
};

export default bloom;