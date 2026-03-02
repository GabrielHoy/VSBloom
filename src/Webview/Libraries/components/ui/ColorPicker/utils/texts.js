export const defaultTexts = {
    label: {
        h: 'Hue Channel',
        s: 'Saturation Channel',
        v: 'Brightness Channel ("Value")',
        r: 'Red Channel',
        g: 'Green Channel',
        b: 'Blue Channel',
        a: 'Alpha Channel',
        hex: 'Hex Color',
        withoutColor: 'Without Color'
    },
    color: {
        rgb: 'RGBA',
        hsv: 'HSVA',
        hex: 'Hex'
    },
    changeTo: 'Swap to ',
    swatch: {
        ariaTitle: 'Color Presets',
        ariaLabel: (color) => `Select Color: ${color}`
    }
};
export const defaultA11yTexts = {
    contrast: 'Contrast :',
    nbGradeSummary: (count) => count ? `⚠️ ${count} contrast grade${count && 's'} fail` : 'Contrast grade information',
    guidelines: `Learn more at <a href="https://webaim.org/articles/contrast/" target="_blank">WebAIM contrast guide</a>`
};
