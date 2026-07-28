/**
 * Audio Frame Processors
 *
 * Contains a few different functions utilized for processing
 * audio frames, once they've been appropriately analyzed, parsed
 * and aggregated together - these are intended to be assigned as
 * callback functions to a CaptureManager instance via the function
 * `CaptureManager::SetOnFrameAggregatedCallback()`.
 */
#pragma once

#include "Audio/CaptureManager.hpp"
#include <unordered_map>

namespace VSBloom::Audio {

#if defined(DEBUG)
    // This allows us to easily swap which audio frame aggregation
    // callback C++ will end up using in debug builds by default,
    // useful to MiTM the audio frames that'd usually be blasted
    // through the IPC channel and possibly do something else w/ them
    constexpr std::string_view DEFAULT_FRAME_AGGREGATION_CALLBACK_NAME = "sink";
#else
    constexpr std::string_view DEFAULT_FRAME_AGGREGATION_CALLBACK_NAME = "send-over-ipc";
#endif // DEBUG

    extern const std::unordered_map<std::string, FrameAggregationCallback_t> frameAggregationCallbacks;

} // namespace VSBloom::Audio