/**
 * Creates trailing lines that follow the text cursor in editor instances.
 *
 * This is essentially a router for the trail types
 * and doesn't provide trail logic itself; see the TrailTypes folder!
 */

import bloom from 'bloom';
import type { EffectConfigResolver } from 'src/EffectLib/Bloom/Configs';
import type { Janitor } from 'src/EffectLib/Bloom/Janitors';
import { effectConfig } from './TrailConfigTypes';
import * as DisconnectedTrails from './TrailTypes/Disconnected';
import * as SolidTrails from './TrailTypes/Solid';

// const vsbloom = window.__VSBLOOM__;

type ValidTrailType = 'solid' | 'disconnected';

let janitor: Janitor;

async function SwapToTrailType(newTrailType: ValidTrailType) {
	const cleanerTaskPromise = janitor.GetNamedCleanupTask('active-trail-type')?.CleanNow();
	if (cleanerTaskPromise) {
		await cleanerTaskPromise;
	}

	let cleanerCallback: () => Promise<void>;
	switch (newTrailType as ValidTrailType) {
		case 'solid':
			cleanerCallback = async () => await SolidTrails.CleanupTrail();
			await SolidTrails.InitTrail(effectConfig);
			break;
		case 'disconnected':
			cleanerCallback = async () => await DisconnectedTrails.CleanupTrail();
			await DisconnectedTrails.InitTrail(effectConfig);
			break;
	}

	janitor.AddNamed('active-trail-type', cleanerCallback);
}

export async function Start(configResolver: EffectConfigResolver) {
	janitor = new bloom.janitors.Janitor();

	//This mutator is where the magic happens for trails
	//it spins off a new trail type initializer/cleaner
	//whenever the trail type is changed
	//(see TrailTypes folder for the actual trail implementations)
	const trailTypeMutator = await bloom.configs.RegisterEffectConfigMutator({
		pathResolver: configResolver.GetPropertyPath('type'),
		internalValueMutator: async (newTrailType, initial) => {
			effectConfig.type = newTrailType as ValidTrailType;
			if (!initial) {
				SwapToTrailType(effectConfig.type);
			}
		},
	});

	janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(trailTypeMutator));
	const trailColorMutator = await bloom.configs.RegisterEffectConfigMutator({
		pathResolver: configResolver.GetPropertyPath('color'),
		internalValueMutator: (changedValue, initial) => {
			effectConfig.color = changedValue as string;
			if (!initial) {
				SwapToTrailType(effectConfig.type);
			}
		},
	});
	janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(trailColorMutator));

	const maxSolidTrailLengthMutator = await bloom.configs.RegisterEffectConfigMutator({
		pathResolver: configResolver.GetPropertyPath('maxSolidTrailLength'),
		internalValueMutator: (changedValue, initial) => {
			effectConfig.maxSolidTrailLength = changedValue as number;
			if (!initial) {
				SwapToTrailType(effectConfig.type);
			}
		},
	});
	janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(maxSolidTrailLengthMutator));

	const solidTrailWidthMutator = await bloom.configs.RegisterEffectConfigMutator({
		pathResolver: configResolver.GetPropertyPath('solidTrailWidth'),
		internalValueMutator: (changedValue, initial) => {
			effectConfig.solidTrailWidth = changedValue as number;
			if (!initial) {
				SwapToTrailType(effectConfig.type);
			}
		},
	});
	janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(solidTrailWidthMutator));

	const solidTrailSpeedMutator = await bloom.configs.RegisterEffectConfigMutator({
		pathResolver: configResolver.GetPropertyPath('solidTrailSpeed'),
		internalValueMutator: (changedValue, initial) => {
			effectConfig.solidTrailSpeed = changedValue as number;
			if (!initial) {
				SwapToTrailType(effectConfig.type);
			}
		},
	});
	janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(solidTrailSpeedMutator));

	const solidTrailCountMutator = await bloom.configs.RegisterEffectConfigMutator({
		pathResolver: configResolver.GetPropertyPath('solidTrailCount'),
		internalValueMutator: (changedValue, initial) => {
			effectConfig.solidTrailCount = changedValue as number;
			if (!initial) {
				SwapToTrailType(effectConfig.type);
			}
		},
	});
	janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(solidTrailCountMutator));

	const solidTrailMaxAngleChangePerFrameMutator = await bloom.configs.RegisterEffectConfigMutator({
		pathResolver: configResolver.GetPropertyPath('solidTrailMaxAngleChangePerFrame'),
		internalValueMutator: (changedValue, initial) => {
			effectConfig.solidTrailMaxAngleChangePerFrame = changedValue as number;
			if (!initial) {
				SwapToTrailType(effectConfig.type);
			}
		},
	});
	janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(solidTrailMaxAngleChangePerFrameMutator));

	const aaMutator = await bloom.configs.RegisterEffectConfigMutator({
		pathResolver: 'effectRendering.enableAntiAliasing',
		internalValueMutator: (changedValue, initial) => {
			effectConfig.enableAA = changedValue as boolean;
			//The 'solid' trail type depends on canvas rendering via PixiJS;
			//so when AA changes we'll need to re-initialize the trail in that case
			if (!initial && effectConfig.type === 'solid') {
				SwapToTrailType(effectConfig.type);
			}
		},
	});
	janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(aaMutator));

	const trailDurationMutator = await bloom.configs.RegisterEffectConfigMutator({
		pathResolver: configResolver.GetPropertyPath('disconnectedTrailSegmentLifetime'),
		internalValueMutator: (changedValue) => {
			effectConfig.disconnectedTrailSegmentLifetime = (changedValue as number) / 1000;
			//we don't do an 'initial' check here since it's
			//the last mutator to be registered,
			//we'll use this call to actually initialize the trail
			//to begin with
			SwapToTrailType(effectConfig.type);
		},
	});
	janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(trailDurationMutator));
}

export function Stop() {
	janitor.Destroy();
}
