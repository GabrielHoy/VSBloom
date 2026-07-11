/**
 * PulseAudio Monitor Source Resolver
 *
 * Miniaudio's loopback capture mode `ma_device_type_loopback` is
 * WASAPI-exclusive, there is no equivalent on PulseAudio/ALSA/JACK. On
 * Linux, PulseAudio (and PipeWire via `pipewire-pulse` compatibility
 * socket) instead automatically creates a ".monitor" capture source for
 * every playback sink, which miniaudio's PulseAudio backend already
 * surfaces as an 'ordinary' capture device during normal enumeration.
 *
 * This file resolves a chosen 'playback' device to its corresponding
 * 'monitor source', so `CaptureSession` can open that as a plain
 * `ma_device_type_capture` device instead of relying on loopback mode.
 */
#pragma once

#if defined(VSBLOOM_AUDIO_BACKEND_PULSEAUDIO)

    #include "miniaudio.h"

namespace VSBloom::Audio {

    /**
     * @throws std::runtime_error if the source can't be resolved (e.g. the
     * sink disappeared, the PulseAudio context can't be initialized, or
     * enumeration fails).
     */
    ma_device_id ResolveMonitorSourceForPlaybackDevice(const ma_device_id& playbackDeviceId);

} // namespace VSBloom::Audio

#endif // VSBLOOM_AUDIO_BACKEND_PULSEAUDIO
