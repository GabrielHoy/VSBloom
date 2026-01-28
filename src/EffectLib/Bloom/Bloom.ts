/**
 * Bloom: The VSBloom Client's 'All-Purpose' Utility Container
 */

/// <reference lib="dom" />

import * as dom from './DOM'; 
import * as configs from './Configs';
import * as janitors from './Janitors';

const bloom = {
    dom,
    configs,
    janitors,
};

export default bloom;