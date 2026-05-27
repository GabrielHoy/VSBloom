import fs from "fs";
import path from "path";
import * as jsonc from 'jsonc-parser';
import * as Colorful from "../src/Debug/Colorful.ts";

const OUTPUT_PACKAGE_FILE: string = "package.json";
const DEFAULT_PACKAGE_USER_CONFIGS_FILE: string = "bundler/DefaultPackageUserConfigs.jsonc";
const EFFECT_CONFIG_ORDERING_FILE: string = "src/Effects/EffectConfigOrdering.jsonc";

const prettyLogPrefix: string = Colorful.ConstructNonBrandedLogPrefix("PackageBuilder", "info") + " ";

interface SettingsEditorDisplayName {
    text: string;
    useMarkdown: boolean;
}

interface PackagePropertyDefinition {
    order: number;
    type: string;
    default: unknown;
    enum?: string[];
    step?: number;
    isColor?: boolean;
    cssUnit?: string;
    description: string;
    markdownDescription: string;
    hideFromCustomEditor?: boolean;
    settingsEditorDisplayName?: string | SettingsEditorDisplayName;
}

interface PackageConfigurationCategory {
    title: string;
    order: number;
    categoryDescription?: string;
    properties: Record<string, PackagePropertyDefinition>;
}

interface ConfigurableProperty {
    name: string;
    type: string;
    default: unknown;
    enum?: string[];
    step?: number;
    isColor?: boolean;
    cssUnit?: string;
    description: string;
    markdownDescription: string;
    settingsEditorDisplayName?: string | SettingsEditorDisplayName;
}

export interface EffectConfig {
    effectDisplayName: string;
    disabled: boolean;
    configurableProperties: ConfigurableProperty[];
}

interface EffectCategoryOrdering {
    categoryName: string;
    categoryDescription?: string;
    effects: string[];
}

interface EffectConfigOrderingFile {
    categories: EffectCategoryOrdering[];
}

interface PackageJSON {
    contributes: {
        icons: Record<string, unknown>;
        commands: unknown[];
        configuration: PackageConfigurationCategory[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

function GetInternalName(effectDisplayName: string): string {
    return effectDisplayName.charAt(0).toLowerCase() + effectDisplayName.slice(1).replace(/ /g, "");
}

function GetInternalPathForEffectProperty(effectDisplayName: string, propertyName: string): string {
    return `${GetInternalName(effectDisplayName)}.${GetInternalName(propertyName)}`;
}

function GetPreBuildPackageObject(): PackageJSON {
    const packageJSONObject: PackageJSON = JSON.parse(fs.readFileSync(OUTPUT_PACKAGE_FILE, "utf8"));
    packageJSONObject.contributes.configuration = [];
    return packageJSONObject;
}

function GetEffectConfiguration(effectName: string): EffectConfig {
    const effectDir = path.join("src/Effects", effectName);
    if (!fs.existsSync(effectDir)) {
        throw new Error(`getEffectConfiguration - Effect "${effectName}" does not have a directory at "${effectDir}"`);
    }

    const configFileForEffect = path.join(effectDir, `${effectName}.jsonc`);
    if (!fs.existsSync(configFileForEffect)) {
        throw new Error(`getEffectConfiguration - Effect "${effectName}" does not have a configuration file at "${configFileForEffect}"`);
    }

    return jsonc.parse(fs.readFileSync(configFileForEffect, "utf8")) as EffectConfig;
}

function BuildContributedConfigurationArray(): PackageConfigurationCategory[] {
    const defaultUserConfigs: PackageConfigurationCategory[] = jsonc.parse(
        fs.readFileSync(DEFAULT_PACKAGE_USER_CONFIGS_FILE, "utf8")
    );
    const userConfigsArray: PackageConfigurationCategory[] = [];

    let categoryIndex = 1;
    let propertyIndex = 1;

    for (const defaultUserConfig of defaultUserConfigs) {
        defaultUserConfig.order = categoryIndex++;

        const orderedCatProps: [string, PackagePropertyDefinition][] = [];
        for (const [propKey, propValue] of Object.entries(defaultUserConfig.properties)) {
            orderedCatProps.push([propKey, propValue]);
        }
        orderedCatProps.sort((a, b) => a[1].order - b[1].order);
        for (const [, propValue] of orderedCatProps) {
            propValue.order = propertyIndex++;
        }

        userConfigsArray.push(defaultUserConfig);
    }

    const effectConfigOrdering: EffectConfigOrderingFile = jsonc.parse(
        fs.readFileSync(EFFECT_CONFIG_ORDERING_FILE, "utf8")
    );

    for (const category of effectConfigOrdering.categories) {
        if (!category.categoryName) {
            throw new Error(
                `buildContributedConfigurationArray - Effect configuration ordering file "${EFFECT_CONFIG_ORDERING_FILE}" does not have a category name defined`
            );
        }
        if (!category.effects) {
            throw new Error(
                `buildContributedConfigurationArray - Effect configuration ordering file "${EFFECT_CONFIG_ORDERING_FILE}" does not have an effects array defined`
            );
        }

        const effectCategoryProperties: Record<string, PackagePropertyDefinition> = {};
        const newEffectCategory: PackageConfigurationCategory = {
            title: category.categoryName,
            order: categoryIndex++,
            properties: effectCategoryProperties,
        };
        if (category.categoryDescription) {
            newEffectCategory.categoryDescription = category.categoryDescription;
        }

        for (const effectName of category.effects) {
            const effectConfig = GetEffectConfiguration(effectName);
            if (effectConfig.disabled) {
                console.log(`${prettyLogPrefix}The effect "${effectName}" is ${Colorful.GetColoredString([255,0,255], "disabled", ["bold", "italic", "underline"])}; not including it in the configuration for this build...`);
                continue;
            }
            if (!effectConfig.configurableProperties) {
                throw new Error(
                    `buildContributedConfigurationArray - Effect "${effectName}" does not have a configurable properties array defined in its configuration file`
                );
            }

            for (const configurableProp of effectConfig.configurableProperties) {
                const internalExtensionPathForProp = `vsbloom.${GetInternalPathForEffectProperty(
                    effectConfig.effectDisplayName,
                    configurableProp.name
                )}`;

                effectCategoryProperties[internalExtensionPathForProp] = {
                    order: propertyIndex++,
                    type: configurableProp.type,
                    enum: configurableProp.enum,
                    default: configurableProp.default,
                    step: configurableProp.step,
                    isColor: configurableProp.isColor,
                    cssUnit: configurableProp.cssUnit,
                    description: configurableProp.description,
                    markdownDescription: configurableProp.markdownDescription,
                    settingsEditorDisplayName: configurableProp.settingsEditorDisplayName,
                };
            }
        }

        userConfigsArray.push(newEffectCategory);
    }

    return userConfigsArray;
}

function SavePackageFile(packageJSONObject: PackageJSON): void {
    fs.writeFileSync(OUTPUT_PACKAGE_FILE, JSON.stringify(packageJSONObject, null, "\t"), "utf8");
}

export function RebuildPackageFile(): void {
    const packageJSONObject = GetPreBuildPackageObject();
    packageJSONObject.contributes.configuration = BuildContributedConfigurationArray();
    SavePackageFile(packageJSONObject);
}
