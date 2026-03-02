import { default as ColorPicker } from './components/ColorPicker.svelte';
export default ColorPicker;
export type { HsvaColor, RgbaColor } from 'colord';
export declare const ChromeVariant: {
    wrapper: import("svelte").Component<import("./components/variant/chrome-picker/Wrapper.svelte").Props, {}, "wrapper">;
};
export declare const A11yVariant: {
    wrapper: import("svelte").Component<import("./components/variant/accessibility/A11yHorizontalWrapper.svelte").Props, {}, "wrapper">;
    a11yNotice: import("svelte").Component<import("./components/variant/accessibility/A11yNotice.svelte").Props, {}, "">;
    a11ySingleNotice: import("svelte").Component<import("./components/variant/accessibility/A11ySingleNotice.svelte").Props, {}, "">;
};
export { mix } from './utils/colors.js';
