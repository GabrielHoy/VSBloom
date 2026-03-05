/**
 * 
 * 'Colorful'
 * 
 * Long story short, ooh aah pretty colors for
 * the debug console ooh aaaaah oh wow hey
 * look at that it's completely unusable
 * for any other VSC console besides the
 * debug console wooooo!
 * 
 */

import * as chalkModule from "chalk";

export let isColoredOutputEnabled = true;
export let colorful = new chalkModule.Instance({ level: 3 });

type ColorDefinition = {
    rgb: [number, number, number];
    rgbFunc: (...args: [number, number, number]) => chalkModule.Chalk;
}

export const vsBloomLogBrandNameColor: ColorDefinition = {rgb: [ 41, 184, 219 ], rgbFunc: colorful.rgb};
export const coloredLogBrandNetworkOriginNameColors: Record<string, ColorDefinition> = {
    Server: {rgb: [ 0, 255, 255 ], rgbFunc: colorful.rgb}, //colorful.cyanBright,
    Client: {rgb: [ 0, 255, 0 ], rgbFunc: colorful.rgb}, //colorful.green,
};
export const coloredLogSourceNameColors: Record<string, ColorDefinition> = {
    Server: {rgb: [ 0, 180, 180 ], rgbFunc: colorful.rgb}, //colorful.cyanBright,
    Client: {rgb: [ 0, 180, 0 ], rgbFunc: colorful.rgb}, //colorful.green,
    EffectManager: {rgb: [ 229, 229, 16 ], rgbFunc: colorful.rgb}, //colorful.yellow,
    Extension: {rgb: [ 128, 128, 128 ], rgbFunc: colorful.rgb}, //colorful.grey,
    GlyphBuilder: {rgb: [ 144, 0, 255 ], rgbFunc: colorful.bold.rgb}, // rich, bright purple
};
export const logTypeColoring: Record<string, ColorDefinition> = {
    debug: {rgb: [ 255, 0, 255 ], rgbFunc: colorful.rgb}, //colorful.magentaBright,
    info: {rgb: [ 180, 180, 180 ], rgbFunc: colorful.rgb}, //colorful.white,
    warn: {rgb: [ 255, 165, 0 ], rgbFunc: colorful.rgb}, //colorful.rgb(255, 165, 0),
    error: {rgb: [ 255, 0, 0 ], rgbFunc: colorful.bold.underline.rgb}, //colorful.redBright.bold.underline
};

function SlerpColorDefinitions(c1: ColorDefinition, c2: ColorDefinition, t: number): [number, number, number] {
    t = Math.max(0, Math.min(1, t));

    const a = c1.rgb.map(x => x / 255);
    const b = c2.rgb.map(x => x / 255);
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const theta = Math.acos(Math.max(-1, Math.min(1, dot)));

    if (theta < 1e-5) {
        return a.map((val, i) => Math.round((1 - t) * val * 255 + t * b[i] * 255)) as [number, number, number];
    }

    const sinTheta = Math.sin(theta);
    const factor1 = Math.sin((1 - t) * theta) / sinTheta;
    const factor2 = Math.sin(t * theta) / sinTheta;

    const slerpValues = a.map((val, i) => val * factor1 + b[i] * factor2);

    return slerpValues.map(val => Math.round(val * 255)) as [number, number, number];
}

export function ConstructVSBloomLogPrefix(source: keyof typeof coloredLogSourceNameColors, logType?: keyof typeof logTypeColoring): string {
    const logBrandNameColor = vsBloomLogBrandNameColor;
    const logBrandToSourceSepColor = SlerpColorDefinitions(logBrandNameColor, coloredLogSourceNameColors[source], 0.5);
    const logSourceColor = coloredLogSourceNameColors[source];

    if (logType) {
        const logSourceToTypeSepColor = SlerpColorDefinitions(logSourceColor, logTypeColoring[logType], 0.5);
        const logTypeColor = logTypeColoring[logType];

        return `[${logBrandNameColor.rgbFunc(...logBrandNameColor.rgb)("VSBloom")}${logBrandNameColor.rgbFunc(...logBrandToSourceSepColor)("/")}${logSourceColor.rgbFunc(...logSourceColor.rgb)(source)}${logSourceColor.rgbFunc(...logSourceToTypeSepColor)("/")}${logTypeColor.rgbFunc(...logTypeColor.rgb)(logType.toUpperCase())}]: `;
    } else {
        return `[${logBrandNameColor.rgbFunc(...logBrandNameColor.rgb)("VSBloom")}${logBrandNameColor.rgbFunc(...logBrandToSourceSepColor)("/")}${logSourceColor.rgbFunc(...logSourceColor.rgb)(source)}]: `;
    }
}

export function ConstructNonBrandedLogPrefix(source: keyof typeof coloredLogSourceNameColors, logType?: keyof typeof logTypeColoring): string {
    const logSourceColor = coloredLogSourceNameColors[source];

    if (logType) {
        const logSourceToTypeSepColor = SlerpColorDefinitions(logSourceColor, logTypeColoring[logType], 0.5);
        const logTypeColor = logTypeColoring[logType];

        return `[${logSourceColor.rgbFunc(...logSourceColor.rgb)(source)}${logSourceColor.rgbFunc(...logSourceToTypeSepColor)("/")}${logTypeColor.rgbFunc(...logTypeColor.rgb)(logType.toUpperCase())}]: `;
    } else {
        return `[${logSourceColor.rgbFunc(...logSourceColor.rgb)(source)}]: `;
    }
}

export function GetColoredString(rgb: [number, number, number], str: string, modifiers?: ("bold" | "underline" | "inverse" | "dim" | "italic" | "reset")[]): string {
    if (isColoredOutputEnabled) {
        if (modifiers) {
            let func = colorful;
            for (const modifier of modifiers) {
                switch (modifier) {
                    case "bold":
                        func = func.bold;
                        break;
                    case "underline":
                        func = func.underline;
                        break;
                    case "inverse":
                        func = func.inverse;
                        break;
                    case "dim":
                        func = func.dim;
                        break;
                    case "italic":
                        func = func.italic;
                        break;
                    case "reset":
                        func = colorful.reset;
                        break;
                    default:
                        throw new Error(`Unknown modifier given to ColorFormatString: ${modifier}`);
                }
            }
            return func.rgb(...rgb)(str);
        } else {
            return colorful.rgb(...rgb)(str);
        }
    } else {
        return str;
    }
}

export function SetColoredOutputEnabled(shouldColor: boolean): void {
    isColoredOutputEnabled = shouldColor;
    colorful = new chalkModule.Instance({ level: isColoredOutputEnabled ? 3 : 0 });
}
