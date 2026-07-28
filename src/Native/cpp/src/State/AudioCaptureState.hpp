/**
 * Audio Capture State
 *
 * Facilitates what is essentially global state for the audio capture system
 * in the Native Runtime, allowing for several IPCMethod's to access, instantiate,
 * and manage the various captured devices and their associated capture devices,
 * as well as entirely spinning up / tearing down CaptureManager's themselves.
 */
#pragma once

#include "Audio/CaptureManager.hpp"
#include <functional>
#include <memory>
#include <mutex>

namespace VSBloom::State {

    class AudioCaptureState {
      public:

        AudioCaptureState(int pollsPerSecond = 30);
        ~AudioCaptureState();

        AudioCaptureState(const AudioCaptureState&)            = delete;
        AudioCaptureState& operator=(const AudioCaptureState&) = delete;

        std::unique_ptr<Audio::CaptureManager> captureManager;
        unsigned int                           curPollsPerSecond;
    };

    namespace {

        extern std::unique_ptr<AudioCaptureState> currentCaptureState;
        extern std::mutex                         captureStateMutex;

    } // namespace

    /**
     * Runs a callback with a reference to the current capture state, as a
     * unique_ptr.
     *
     * Worth nothing, resetting the unique_ptr to destroy the capture state
     * is a VALID operation - therefore the unique_ptr you get sent in the
     * callback may be EMPTY. You might have to instantiate a new one, or
     * you'll at least have to check for the case accordingly.
     *
     * Don't take too long with your callback, a mutex is locked for the duration
     * of it.
     */
    void AccessAudioCaptureState(std::function<void(std::unique_ptr<AudioCaptureState>&)> callback);

} // namespace VSBloom::State