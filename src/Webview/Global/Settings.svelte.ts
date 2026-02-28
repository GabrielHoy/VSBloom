import extensionPackageJSON from "../../../package.json";
import type { VSBloomClientConfig } from "../../ExtensionBridge/Bridge";
import { vscode } from "../Util/VSCodeAPI";

const defaultEffectSettings = extensionPackageJSON.contributes.configuration;

export type PropertyEntry = typeof defaultEffectSettings[number]['properties'][keyof typeof defaultEffectSettings[number]['properties']] & { hideFromCustomEditor?: boolean };

export const effectSettings = $state({
    default: defaultEffectSettings,
    pulledFromExtension: false,
    values: {} as Record<string, any>,
});

export function AssignCurrentEffectSettings(newSettings: VSBloomClientConfig) {
    for (let categoryIdx = 0; categoryIdx < defaultEffectSettings.length; categoryIdx++) {
        const category = defaultEffectSettings[categoryIdx];
        for (const [propInternalPath, propData] of Object.entries(category.properties)) {
            // get the value from the new settings if it's provided(always should be but we'll check for safety)
            const internalPathParts = propInternalPath.split('.');
            const effectCategory = internalPathParts[1]; //skip the 'vsbloom.' prefix, get the string after that
            const effectPropertyName = internalPathParts[2]; //get the string after the category

            const newSettingsCategoryData = newSettings[effectCategory];
            if (typeof newSettingsCategoryData === 'object' && newSettingsCategoryData !== null) {
                const newSettingsPropValue = newSettingsCategoryData[effectPropertyName];
                if (newSettingsPropValue !== undefined) {
                    effectSettings.values[propInternalPath] = newSettingsPropValue;
                } else {
                    console.error(`Expected property ${effectPropertyName} to be defined in newSettings for category ${effectCategory} but it was undefined inside of AssignCurrentEffectSettings`);
                }
            } else {
                console.error(`Expected object in newSettings inside of AssignCurrentEffectSettings for property category ${propInternalPath}but got ${typeof newSettingsCategoryData}`);
            }
        }
    }
    effectSettings.pulledFromExtension = true;
}

export function UpdateEffectSetting(internalSettingPath: string, newValue: any) {
    effectSettings.values[internalSettingPath] = newValue;
    console.debug("Updating setting", internalSettingPath, "to", newValue);
    vscode.PostToExtension({
        type: 'update-setting',
        data: {
            internalSettingPath,
            newValue
        }
    });
}