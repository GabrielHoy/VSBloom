import bloom from 'bloom';
import type { EffectConfigResolver } from 'src/EffectLib/Bloom/Configs';
import type { Janitor } from 'src/EffectLib/Bloom/Janitors';
import effectConfigJSON from './AudioDebugTest.jsonc';
import { AudioAnalysisFrameChannel } from 'src/ExtensionBridge/Binary/BinaryChannels';


const [effectConfig, effectConfigKeyToCSSVar] =
	bloom.configs.GetReducedTypeScriptVariablesFromEffectJSON(effectConfigJSON);
const vsbloom = window.__VSBLOOM__;
let janitor: Janitor;

export async function Start(configResolver: EffectConfigResolver) {
	janitor = new bloom.janitors.Janitor();

	await bloom.configs.SetupEffectConfigMutatorsForEffectConfigChanges(
		effectConfig,
		effectConfigKeyToCSSVar,
		configResolver,
		janitor,
	);

    const audioFrameUnsubscriber = vsbloom.streams.Subscribe(AudioAnalysisFrameChannel, (newAudioFrame) => {
        vsbloom.Log('info', 'New audio frame received');
        vsbloom.Log("info", "Frame in question is", newAudioFrame);
    });
    janitor.Add(() => {
        audioFrameUnsubscriber();
    });
    
    const generalStateUnsubscriber = vsbloom.sharedState.Subscribe(() => {
        vsbloom.Log('debug', 'General state changed', vsbloom.sharedState.state);
    });
    janitor.Add(() => {
        generalStateUnsubscriber();
    });

    // Path-scoped, so a write anywhere else in shared state doesn't wake us -
    // and a reconnect snapshot carrying the same device list doesn't either.
    const audioDevicesUnsubscriber = vsbloom.sharedState.Subscribe(
        'audio.availableDevices',
        (availableDevices) => {
            vsbloom.Log('debug', 'Available audio devices changed', availableDevices);
        },
    );
    janitor.Add(() => {
        audioDevicesUnsubscriber();
    });

    const capturedAudioDevicesUnsubscriber = vsbloom.sharedState.Subscribe(
        'audio.capturedDeviceIds',
        (capturedDeviceIds) => {
            vsbloom.Log('debug', 'Captured audio devices changed', capturedDeviceIds);
        },
    );
    janitor.Add(() => {
        capturedAudioDevicesUnsubscriber();
    });
}

export function Stop() {
	janitor.Destroy();
}
