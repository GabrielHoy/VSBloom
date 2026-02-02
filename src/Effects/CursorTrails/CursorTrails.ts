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

const vsbloom = window.__VSBLOOM__;

type ValidTrailType = 'solid' | 'disconnected';

const effectConfig = {
    trailDuration: 0.75,
};

let janitor: Janitor;

export async function Start(configResolver: EffectConfigResolver) {
    janitor = new bloom.janitors.Janitor();

    //register an effect config mutator for the trail duration
    const trailDurationMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('duration'),
        internalValueMutator: (changedValue) => {
            effectConfig.trailDuration = (changedValue as number) / 1000;
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(trailDurationMutator));

    //This mutator is where the magic happens for trails
    //it spins off a new trail type initializer/cleaner
    //whenever the trail type is changed
    //(see TrailTypes folder for the actual trail implementations)
    const trailTypeMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('type'),
        internalValueMutator: async (newTrailType) => {
            vsbloom.Log('debug', 'Trail Type Changed to: ' + (newTrailType as ValidTrailType));
            janitor.GetNamedCleanupTask('active-trail-type')?.CleanNow();

            let cleanerCallback: () => Promise<void>;
            switch (newTrailType as ValidTrailType) {
                case 'solid':
                    vsbloom.Log('debug', 'Solid Trail Type Selected');
                    cleanerCallback = async () => await SolidTrails.CleanupTrail();
                    await SolidTrails.InitTrail(effectConfig);
                    break;
                case 'disconnected':
                    vsbloom.Log('debug', 'Disconnected Trail Type Selected');
                    cleanerCallback = async () => await DisconnectedTrails.CleanupTrail();
                    await DisconnectedTrails.InitTrail(effectConfig);
                    break;
            }

            janitor.AddNamed('active-trail-type', cleanerCallback);
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(trailTypeMutator));
}

export function Stop() {
    janitor.Destroy();
}