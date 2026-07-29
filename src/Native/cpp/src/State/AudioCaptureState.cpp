#include "AudioCaptureState.hpp"
#include "Audio/AudioFrameProcessors.hpp"

namespace VSBloom::State {

    namespace {

        std::unique_ptr<AudioCaptureState> currentCaptureState;
        std::mutex                         captureStateMutex;

    } // namespace

    AudioCaptureState::AudioCaptureState(int pollsPerSecond)
        : curPollsPerSecond(pollsPerSecond) {
        captureManager = std::make_unique<Audio::CaptureManager>(curPollsPerSecond);

        // Assign the default frame aggregation callback to the capture manager
        // when we create a new capture state instance
        const Audio::FrameAggregationCallback_t defaultAggregationCallback =
            Audio::frameAggregationCallbacks.at(Audio::DEFAULT_FRAME_AGGREGATION_CALLBACK_NAME.data());

        captureManager->SetOnFrameAggregatedCallback(defaultAggregationCallback);
    }

    AudioCaptureState::~AudioCaptureState() {
    }

    void AccessAudioCaptureState(std::function<void(std::unique_ptr<AudioCaptureState>&)> callback) {
        std::lock_guard<std::mutex> lock(captureStateMutex);
        callback(currentCaptureState);
    }

    std::vector<std::string>
    AudioCaptureState::SetCurrentlyCapturedDeviceIds(const std::vector<std::string>& desiredDeviceIdsHex) {
        const bool clearingCapturedDevices = desiredDeviceIdsHex.empty();

        std::vector<std::string> capturedDeviceIdsHex;
        AccessAudioCaptureState([&](std::unique_ptr<AudioCaptureState>& state) -> void {
            if (clearingCapturedDevices) {
                // Nothing left to capture, so drop the whole capture state rather
                // than leaving an idle CaptureManager (and its aggregator thread)
                // alive for nobody.
                // ()`capturedDeviceIdsHex` stays empty accordingly)
                state.reset();
                return;
            }

            // Does a capture state exist yet? If not, let's create one
            if (!state) {
                state = std::make_unique<AudioCaptureState>();
            }

            // The AudioCaptureState is guarunteed to construct a CaptureManager as
            // part of its constructor; we can rely on it being valid here
            Audio::CaptureManager* captureManager = state->captureManager.get();
            capturedDeviceIdsHex                  = captureManager->UpdateCurrentCapturedDevices(desiredDeviceIdsHex);
        });

        return capturedDeviceIdsHex;
    }

    std::vector<std::string> AudioCaptureState::GetCurrentlyCapturedDeviceIds() {
        std::vector<std::string> capturedDeviceIdsHex;
        AccessAudioCaptureState([&capturedDeviceIdsHex](std::unique_ptr<AudioCaptureState>& state) -> void {
            if (!state) {
                return; // capture isn't running at all - nothing is being captured
            }

            if (const Audio::CaptureManager* captureManager = state->captureManager.get()) {
                capturedDeviceIdsHex = captureManager->GetCurrentlyCapturedDeviceIds();
            }
        });

        return capturedDeviceIdsHex;
    }

} // namespace VSBloom::State