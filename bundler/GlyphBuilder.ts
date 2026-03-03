/**
 * Builds one or more `.woff` icon font files from the glyph definitions
 * declared in `bundler/GlyphConfig.json`, then writes the corresponding
 * `contributes.icons` entries into the extension's `package.json`.
 *
 * Each entry in the config array produces a separate `.woff` file.
 * Glyph sources can be either SVG (used directly) or PNG (traced to
 * SVG via potrace first, output into `imagery/svg/`).
 * 
 * (full disclosure - thanks for one-shotting like 80% of this one claude, haha)
 */
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { SVGIcons2SVGFontStream } from "svgicons2svgfont";
import svg2ttf from "svg2ttf";
import ttf2woff from "ttf2woff";
import * as potrace from "potrace";
import * as Colorful from "../src/Debug/Colorful.ts";

// svgicons2svgfont uses sax internally; raise its buffer limit
// to handle the large path data produced by bitmap tracing
const sax = require("sax") as { MAX_BUFFER_LENGTH: number };
sax.MAX_BUFFER_LENGTH = 1024 * 1024;

const prettyLogPrefix: string = Colorful.ConstructNonBrandedLogPrefix("GlyphBuilder", "info") + " ";

// ---------------------------------------------------------------------------
// Types matching the ExtensionGlyphConfig.schema.json schema
// ---------------------------------------------------------------------------

export interface PotraceOptions {
    threshold: number;
    turdSize?: number;
    optTolerance?: number;
    alphaMax?: number;
    background?: string;
    color?: string;
    steps?: number;
    blackOnWhite?: boolean;
    width?: number;
    height?: number;
    optCurve?: boolean;
}

export interface GlyphEntry {
    glyphName: string;
    description?: string;
    codepoint: string;
    source: string;
    potraceOptions?: PotraceOptions;
}

export interface FontDefinition {
    fileName: string;
    glyphs: GlyphEntry[];
}

// Internal representation of a glyph after source resolution
interface ResolvedGlyph {
    name: string;
    unicode: string;
    svgPath: string;
}

// Shape of the package.json `contributes.icons` value for a single icon
interface PackageIconContribution {
    description: string;
    default: {
        fontPath: string;
        fontCharacter: string;
    };
}

// Minimal typed subset of the package.json we read/write
interface PackageJSON {
    contributes: {
        icons: Record<string, PackageIconContribution>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT: string = path.join(__dirname, "..");
const GLYPH_CONFIG_PATH: string = path.join(__dirname, "GlyphConfig.json");
const GLYPH_OUTPUT_DIR: string = path.join(PROJECT_ROOT, "imagery", "glyphs");
const PACKAGE_JSON_PATH: string = path.join(PROJECT_ROOT, "package.json");

// ---------------------------------------------------------------------------
// PNG → SVG tracing
// ---------------------------------------------------------------------------

function TracePNGToSVG(pngPath: string, svgPath: string, options: PotraceOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        potrace.trace(pngPath, options, (err, svg) => {
            if (err) {
                return reject(err);
            }
            fs.writeFileSync(svgPath, svg);
            const sizeKB = (Buffer.byteLength(svg) / 1024).toFixed(1);
            console.log(`${prettyLogPrefix}Traced: ${path.basename(pngPath)} ${Colorful.GetColoredString([255,255,0], "->", ["bold"])} ${path.basename(svgPath)} ${Colorful.GetColoredString([255,255,0], `(${sizeKB} KB)`, ["bold"])}`);
            resolve();
        });
    });
}

// ---------------------------------------------------------------------------
// SVG → WOFF font generation
// ---------------------------------------------------------------------------

function GenerateSVGFont(fontName: string, glyphs: ResolvedGlyph[]): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const fontStream = new SVGIcons2SVGFontStream({
            fontName,
            fontHeight: 1000,
            normalize: true,
        });

        fontStream.on("data", (chunk: Buffer | string) =>
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
        );
        fontStream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        fontStream.on("error", reject);

        for (const glyph of glyphs) {
            const svgContent = fs.readFileSync(glyph.svgPath, "utf-8");
            const glyphStream = new Readable({ read() {} }) as Readable & {
                metadata: { unicode: string[]; name: string };
            };
            glyphStream.push(svgContent);
            glyphStream.push(null);
            glyphStream.metadata = {
                unicode: [glyph.unicode],
                name: glyph.name,
            };
            fontStream.write(glyphStream);
        }

        fontStream.end();
    });
}

// ---------------------------------------------------------------------------
// Resolve a single glyph source to an SVG path, tracing PNGs when necessary
// ---------------------------------------------------------------------------

async function ResolveGlyphSource(glyph: GlyphEntry): Promise<ResolvedGlyph> {
    const absoluteSource = path.resolve(PROJECT_ROOT, glyph.source);

    if (!fs.existsSync(absoluteSource)) {
        throw new Error(`Source file not found: ${absoluteSource}`);
    }

    const ext = path.extname(absoluteSource).toLowerCase();

    if (ext === ".svg") {
        console.log(`${prettyLogPrefix}SVG source (direct): ${path.basename(absoluteSource)}`);
        return {
            name: glyph.glyphName,
            unicode: glyph.codepoint,
            svgPath: absoluteSource,
        };
    }

    if (ext === ".png") {
        if (!glyph.potraceOptions) {
            throw new Error(
                `Glyph "${glyph.glyphName}" uses a PNG source but has no potraceOptions defined — ` +
                `potrace options (at minimum 'threshold') are required for bitmap tracing.`
            );
        }

        fs.mkdirSync(GLYPH_OUTPUT_DIR, { recursive: true });
        const tracedSvgPath = path.join(GLYPH_OUTPUT_DIR, `${glyph.glyphName}.svg`);
        await TracePNGToSVG(absoluteSource, tracedSvgPath, glyph.potraceOptions);

        return {
            name: glyph.glyphName,
            unicode: glyph.codepoint,
            svgPath: tracedSvgPath,
        };
    }

    throw new Error(
        `Unsupported source format "${ext}" for glyph "${glyph.glyphName}" — only .svg and .png are supported.`
    );
}

// ---------------------------------------------------------------------------
// Build a single .woff font from a FontDefinition
// ---------------------------------------------------------------------------

function FormatBytes(bytes: number): string {
    if (bytes === 0) {
        return '0 bytes';
    }
    const units: string[] = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB', 'RB', 'QB', "WHAT"];
    const k: number = 1024;
    const i: number = Math.floor(Math.log(bytes) / Math.log(k));
    const num: number = bytes / Math.pow(k, i);
    return `${num.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

async function BuildFont(fontDef: FontDefinition): Promise<void> {
    console.log(`\n${prettyLogPrefix}Font: ${fontDef.fileName}.woff ${Colorful.GetColoredString([144,0,255], `(${fontDef.glyphs.length} glyph(s))`, ["bold"])}`);

    console.log(`${prettyLogPrefix}Resolving glyph sources...`);
    const resolvedGlyphs: ResolvedGlyph[] = [];
    for (const glyph of fontDef.glyphs) {
        resolvedGlyphs.push(await ResolveGlyphSource(glyph));
    }

    console.log(`${prettyLogPrefix}Generating SVG font...`);
    const svgFont = await GenerateSVGFont(fontDef.fileName, resolvedGlyphs);

    console.log(`${prettyLogPrefix}Converting SVG -> TTF...`);
    const ttf = svg2ttf(svgFont, {});
    // Save the TTF file to the GLYPH_OUTPUT_DIR just for completeness' sake
    const ttfPath = path.join(GLYPH_OUTPUT_DIR, `${fontDef.fileName}.ttf`);
    fs.writeFileSync(ttfPath, Buffer.from(ttf.buffer));

    console.log(`${prettyLogPrefix}Converting TTF -> WOFF...`);
    const woff = ttf2woff(ttf.buffer);
    const woffPath = path.join(GLYPH_OUTPUT_DIR, `${fontDef.fileName}.woff`);
    fs.writeFileSync(woffPath, Buffer.from(woff.buffer));

    const stats = fs.statSync(woffPath);
    console.log(`${prettyLogPrefix}Built ${fontDef.fileName}.woff ${Colorful.GetColoredString([255,255,0], `(${FormatBytes(stats.size)})`, ["bold"])}`);

    console.log(`${prettyLogPrefix}Codepoints:`);
    for (const [glyphIndex, glyph] of resolvedGlyphs.entries()) {
        const hex = glyph.unicode.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
        console.log(`${prettyLogPrefix}${glyphIndex + 1}: "${glyph.name}" -> \\u${hex}`);
    }
}

// ---------------------------------------------------------------------------
// Write contributes.icons into package.json
// ---------------------------------------------------------------------------

function CodepointToFontCharacter(codepoint: string): string {
    return "\\" + codepoint.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
}

function RebuildPackageIcons(fontDefinitions: FontDefinition[]): void {
    const packageJSON: PackageJSON = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf-8"));

    packageJSON.contributes.icons = {};

    for (const fontDef of fontDefinitions) {
        const fontPath = `imagery/glyphs/${fontDef.fileName}.woff`;

        for (const glyph of fontDef.glyphs) {
            packageJSON.contributes.icons[glyph.glyphName] = {
                description: glyph.description ?? glyph.glyphName,
                default: {
                    fontPath,
                    fontCharacter: CodepointToFontCharacter(glyph.codepoint),
                },
            };
        }
    }

    fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJSON, null, "\t"), "utf-8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function Main(): Promise<void> {
    console.log(`${prettyLogPrefix}Beginning Compilation of VS: Bloom Glyphs.\n`);

    if (!fs.existsSync(GLYPH_CONFIG_PATH)) {
        throw new Error(`Glyph config not found at ${GLYPH_CONFIG_PATH}`);
    }

    const fontDefinitions: FontDefinition[] = JSON.parse(
        fs.readFileSync(GLYPH_CONFIG_PATH, "utf-8")
    );

    console.log(`${prettyLogPrefix}Loaded ${Colorful.GetColoredString([144,0,255], "(" + fontDefinitions.length + ")", ["bold"])} font definition(s) from ${Colorful.GetColoredString([255,255,0], "GlyphConfig.json", ["italic"])}`);

    for (const fontDef of fontDefinitions) {
        await BuildFont(fontDef);
    }

    console.log(`${prettyLogPrefix}Updating ${Colorful.GetColoredString([255,255,255], "contributes.icons", ["italic"])} section of ${Colorful.GetColoredString([255,255,0], "package.json", ["italic"])}...`);
    RebuildPackageIcons(fontDefinitions);
    console.log(`${prettyLogPrefix}${Colorful.GetColoredString([255,255,0], "package.json", ["italic"])} ${Colorful.GetColoredString([255,255,255], "\`contributes.icons\`", ["italic"])} section ${Colorful.GetColoredString([0,255,0], "updated successfully", ["bold", "underline", "italic"])}`);

    console.log(`${prettyLogPrefix}All ${Colorful.GetColoredString([144,0,255], "(" + fontDefinitions.length + ")", ["bold"])} Glyph Files were ${Colorful.GetColoredString([0,255,0], "successfully compiled!")}`);
}

Main().catch((err: unknown) => {
    console.error("Build failed:", err);
    process.exit(1);
});
