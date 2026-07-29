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
#include <string>
#include <vector>

namespace VSBloom::State {

    class AudioCaptureState {
      public:

        AudioCaptureState(int pollsPerSecond = 30);
        ~AudioCaptureState();

        AudioCaptureState(const AudioCaptureState&)            = delete;
        AudioCaptureState& operator=(const AudioCaptureState&) = delete;

        std::unique_ptr<Audio::CaptureManager> captureManager;
        unsigned int                           curPollsPerSecond;

        /**
         * Points audio capture at exactly `desiredDeviceIdsHex`, spinning the capture
         * state up if it isn't running yet, and returns the hex IDs *actually* being
         * captured afterwards.
         *
         * **Passing an empty list tears audio capture down entirely** and returns an
         * empty list.
         *
         * The return is not an echo: devices with malformed IDs or that fail to open
         * for capture are skipped - so the result may be a strict subset of what was
         * asked for. This is the only point at which that difference is observable;
         * compare against the request if the caller needs to report rejections.
         *
         * Only IDs are returned, not full `AudioDevice`s - resolve them with
         * {@link Audio::ResolveAudioDevicesByIds} *after* this returns, never inside a
         * callback holding the state lock (enumeration is slow and this lock is global).
         */
        static std::vector<std::string>
        SetCurrentlyCapturedDeviceIds(const std::vector<std::string>& desiredDeviceIdsHex);

        /**
         * The hex IDs of every device currently being captured, or an empty list if
         * audio capture isn't running at all.
         *
         * Purely a read - safe to call to answer a parent-process resync without
         * disturbing capture. See {@link SetCurrentlyCapturedDeviceIds} on why this
         * hands back IDs rather than resolved devices.
         */
        static std::vector<std::string> GetCurrentlyCapturedDeviceIds();
    };

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