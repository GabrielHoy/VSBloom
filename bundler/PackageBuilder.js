import fs from "fs";
import path from "path";

const outputPackageFile = "package.json";
const defaultPackageUserConfigsFile = "bundler/DefaultPackageUserConfigs.json";
const effectConfigOrderingFile = "src/Effects/EffectConfigOrdering.json";

function GetInternalName(effectDisplayName) {
    return effectDisplayName.charAt(0).toLowerCase() + effectDisplayName.slice(1).replace(/ /g, '');
}

function GetInternalPathForEffectProperty(effectDisplayName, propertyName) {
    return `${GetInternalName(effectDisplayName)}.${GetInternalName(propertyName)}`;
}

function GetPreBuildPackageObject() {
    const packageJSONObject = JSON.parse(fs.readFileSync(outputPackageFile, "utf8"));

    //clear contributes/configuration since we'll be rebuilding it
    //in an automated fashion instead of manually defining every single
    //setting and user config available in a monolithic file
    packageJSONObject.contributes.configuration = []; 

    return packageJSONObject;
}

function GetEffectConfiguration(effectName) {
    const effectDir = path.join("src/Effects", effectName);
    if (!fs.existsSync(effectDir)) {
        throw new Error(`GetEffectConfiguration - Effect "${effectName}" does not have a directory at "${effectDir}"`);
    }

    const configFileForEffect = path.join(effectDir, `${effectName}.json`);
    if (!fs.existsSync(configFileForEffect)) {
        throw new Error(`GetEffectConfiguration - Effect "${effectName}" does not have a configuration file at "${configFileForEffect}"`);
    }

    const effectConfig = JSON.parse(fs.readFileSync(configFileForEffect, "utf8"));
    return effectConfig;
}

function BuildContributedConfigurationArray(packageJSONObject) {
    const defaultUserConfigs = JSON.parse(fs.readFileSync(defaultPackageUserConfigsFile, "utf8"));
    const userConfigsArray = [];
    
    let categoryIndex = 1;
    let propertyIndex = 1;

    //first up, let's build the array of default 'base'
    //user configs for things like the extension's
    //patcher settings
    for (const defaultUserConfig of defaultUserConfigs) {
        //category ordering
        defaultUserConfig.order = categoryIndex++;

        //property ordering - need to sort by order property
        //within the category, have to do two go-arounds due
        //to the properties being indexed by their key
        //instead of being an array like the categories are
        const orderedCatProps = [];
        for (const [propKey, propValue] of Object.entries(defaultUserConfig.properties)) {
            orderedCatProps.push([propKey, propValue]);
        }
        orderedCatProps.sort((a, b) => a[1].order - b[1].order);
        for (const [propKey, propValue] of orderedCatProps) {
            defaultUserConfig.properties[propKey].order = propertyIndex++;
        }

        userConfigsArray.push(defaultUserConfig);
    }

    //now we get to the reason we're actually building
    //this package.json file dynamically - we need to
    //go through all of the statically defined effects
    //and read their corresponding config JSON files
    //in order to extract the user-configurable values
    //that they define and add them to the package.json's
    //user configs array accordingly
    //
    //additionally, for the ordering of the effect categories
    //themselves - there's another json file for that too o7
    const effectConfigOrdering = JSON.parse(fs.readFileSync(effectConfigOrderingFile, "utf8"));
    for (const category of effectConfigOrdering.categories) {
        if (!category.categoryName) {
            throw new Error(`BuildContributedConfigurationArray - Effect configuration ordering file "${effectConfigOrderingFile}" does not have a category name defined`);
        }
        if (!category.effects) {
            throw new Error(`BuildContributedConfigurationArray - Effect configuration ordering file "${effectConfigOrderingFile}" does not have an effects array defined`);
        }

        const effectCategoryProperties = {};
        const newEffectCategory = {
            "title": category.categoryName,
            "order": categoryIndex++,
            "properties": effectCategoryProperties
        };

        for (const effectName of category.effects) {
            const effectConfig = GetEffectConfiguration(effectName);
            if (!effectConfig.configurableProperties) {
                throw new Error(`BuildContributedConfigurationArray - Effect "${effectName}" does not have a configurable properties array defined in its configuration file at "${configFileForEffect}"`);
            }

            for (const configurableProp of effectConfig.configurableProperties) {
                const internalExtensionPathForProp = `vsbloom.${GetInternalPathForEffectProperty(effectConfig.effectDisplayName, configurableProp.name)}`;
                
                effectCategoryProperties[internalExtensionPathForProp] = {
                    "order": propertyIndex++,
                    "type": configurableProp.type,
                    "enum": configurableProp.enum,
                    "default": configurableProp.default,
                    "description": configurableProp.description,
                    "markdownDescription": configurableProp.markdownDescription
                };
            }
        }

        userConfigsArray.push(newEffectCategory);
    }

    return userConfigsArray;
}

function SavePackageFile(packageJSONObject) {
    fs.writeFileSync(outputPackageFile, JSON.stringify(packageJSONObject, null, "\t"), "utf8");
}

export function RebuildPackageFile()  {
    const packageJSONObject = GetPreBuildPackageObject();

    packageJSONObject.contributes.configuration = BuildContributedConfigurationArray(packageJSONObject);

    SavePackageFile(packageJSONObject);
}