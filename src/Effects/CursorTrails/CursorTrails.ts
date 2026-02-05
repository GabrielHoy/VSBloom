/**
 * Creates trailing lines that follow the text cursor in editor instances.
 * 
 * This is essentially a router for the trail types
 * and doesn't provide trail logic itself; see the TrailTypes folder!
 */

import bloom from 'bloom';
import type { Janitor } from 'src/EffectLib/Bloom/Janitors';
import type { EffectConfigResolver } from 'src/EffectLib/Bloom/Configs';

import * as DisconnectedTrails from './TrailTypes/Disconnected';
import * as SolidTrails from './TrailTypes/Solid';
import { effectConfig } from './TrailConfigTypes';

const vsbloom = window.__VSBLOOM__;

type ValidTrailType = 'solid' | 'disconnected';

let janitor: Janitor;

async function SwapToTrailType(newTrailType: ValidTrailType) {
    vsbloom.Log('debug', 'Trail Type Changed to ' + (newTrailType as ValidTrailType));
    vsbloom.Log('debug', 'janitor named cleanup task: ', janitor.GetNamedCleanupTask('active-trail-type'));
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
            vsbloom.Log('debug', 'trail type changed to ' + newTrailType);
            effectConfig.type = newTrailType as ValidTrailType;
            if (!initial) {
                SwapToTrailType(effectConfig.type);
            }
        }
    });

    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(trailTypeMutator));
    const trailColorMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('color'),
        internalValueMutator: (changedValue, initial) => {
            vsbloom.Log('debug', 'trail color changed to ' + changedValue);
            effectConfig.color = changedValue as string;
            if (!initial) {
                SwapToTrailType(effectConfig.type);
            }
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(trailColorMutator));
    
    const maxSolidTrailLengthMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('maxSolidTrailLength'),
        internalValueMutator: (changedValue, initial) => {
            vsbloom.Log('debug', 'max solid trail length changed to ' + changedValue);
            effectConfig.maxSolidTrailLength = changedValue as number;
            if (!initial) {
                SwapToTrailType(effectConfig.type);
            }
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(maxSolidTrailLengthMutator));

    const solidTrailWidthMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('solidTrailWidth'),
        internalValueMutator: (changedValue, initial) => {
            vsbloom.Log('debug', 'solid trail width changed to ' + changedValue);
            effectConfig.solidTrailWidth = changedValue as number;
            if (!initial) {
                SwapToTrailType(effectConfig.type);
            }
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(solidTrailWidthMutator));

    const solidTrailSpeedMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('solidTrailSpeed'),
        internalValueMutator: (changedValue, initial) => {
            vsbloom.Log('debug', 'solid trail speed changed to ' + changedValue);
            effectConfig.solidTrailSpeed = changedValue as number;
            if (!initial) {
                SwapToTrailType(effectConfig.type);
            }
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(solidTrailSpeedMutator));

    const aaMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: 'effectRendering.enableAntiAliasing',
        internalValueMutator: (changedValue, initial) => {
            vsbloom.Log('debug', 'anti-aliasing changed to ' + changedValue);
            effectConfig.enableAA = changedValue as boolean;
            //The 'solid' trail type depends on canvas rendering via PixiJS;
            //so when AA changes we'll need to re-initialize the trail in that case
            if (!initial && effectConfig.type === "solid") {
                SwapToTrailType(effectConfig.type);
            }
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(aaMutator));


    const trailDurationMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('disconnectedTrailSegmentLifetime'),
        internalValueMutator: (changedValue) => {
            vsbloom.Log('debug', 'disconnected trail segment lifetime changed to ' + changedValue);
            effectConfig.disconnectedTrailSegmentLifetime = changedValue as number / 1000;
            //we don't do an 'initial' check here since it's
            //the last mutator to be registered,
            //we'll use this call to actually initialize the trail
            //to begin with
            SwapToTrailType(effectConfig.type);
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(trailDurationMutator));
}

export function Stop() {
    janitor.Destroy();
}