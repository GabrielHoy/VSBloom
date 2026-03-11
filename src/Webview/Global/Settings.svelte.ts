import extensionPackageJSON from '../../../package.json';
import type {
	VSBloomClientConfig,
	VSBloomConfigObject,
	VSBloomConfigValue,
} from '../../ExtensionBridge/API';
import { vscode } from '../Util/VSCodeAPI';

const defaultEffectSettings = extensionPackageJSON.contributes.configuration;

export type PropertyEntry =
	(typeof defaultEffectSettings)[number]['properties'][keyof (typeof defaultEffectSettings)[number]['properties']] & {
		hideFromCustomEditor?: boolean;
	};
export type EffectSettingLeafValue = Exclude<VSBloomConfigValue, VSBloomConfigObject>;

export const effectSettings = $state({
	default: defaultEffectSettings,
	pulledFromExtension: false,
	values: {} as Record<string, EffectSettingLeafValue>,
});

export function AssignCurrentEffectSettings(newSettings: VSBloomClientConfig) {
	for (let categoryIdx = 0; categoryIdx < defaultEffectSettings.length; categoryIdx++) {
		const category = defaultEffectSettings[categoryIdx];
		for (const [propInternalPath, _propData] of Object.entries(category.properties)) {
			// get the value from the new settings if it's provided(always should be but we'll check for safety)
			const internalPathParts = propInternalPath.split('.');
			const effectCategory = internalPathParts[1]; //skip the 'vsbloom.' prefix, get the string after that
			const effectPropertyName = internalPathParts[2]; //get the string after the category

			const newSettingsCategoryData = newSettings[effectCategory];
			if (typeof newSettingsCategoryData === 'object' && newSettingsCategoryData !== null) {
				const newSettingsPropValue = newSettingsCategoryData[effectPropertyName];
				if (newSettingsPropValue !== undefined) {
					effectSettings.values[propInternalPath] =
						newSettingsPropValue as EffectSettingLeafValue;
				} else {
					console.error(
						`Expected property ${effectPropertyName} to be defined in newSettings for category ${effectCategory} but it was undefined inside of AssignCurrentEffectSettings`,
					);
				}
			} else {
				console.error(
					`Expected object in newSettings inside of AssignCurrentEffectSettings for property category ${propInternalPath}but got ${typeof newSettingsCategoryData}`,
				);
			}
		}
	}
	effectSettings.pulledFromExtension = true;
}

export function UpdateEffectSetting(internalSettingPath: string, newValue: unknown) {
	effectSettings.values[internalSettingPath] = newValue as EffectSettingLeafValue;
	vscode.PostToExtension({
		type: 'update-setting',
		data: {
			internalSettingPath,
			newValue,
		},
	});
}
