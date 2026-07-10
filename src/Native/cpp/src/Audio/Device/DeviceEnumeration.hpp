/**
 * Audio Device Enumeration
 *
 * Platform-agnostic enumeration for audio devices, implemented on top of miniaudio.
 */
#pragma once

#include "AudioDevice.hpp"
#include <vector>

namespace VSBloom::Audio {

    /**
     * Enumerates all currently-connected audio devices visible to the
     * native runtime.
     *
     * @throws std::runtime_error upon failed enumeration of
     * devices, e.g. if the underlying platform audio subsystem itself
     * failed to initialize.
     */
    std::vector<AudioDevice> EnumerateAudioDevices();

} // namespace VSBloom::Audio
