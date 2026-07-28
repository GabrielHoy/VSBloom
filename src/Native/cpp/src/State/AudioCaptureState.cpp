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

} // namespace VSBloom::State