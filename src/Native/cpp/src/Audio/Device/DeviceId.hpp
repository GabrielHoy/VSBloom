/**
 * Audio Device ID Codec
 *
 * `ma_device_id` is a union of backend-specific representations (a WASAPI
 * endpoint ID is a wide string, a PulseAudio one is a narrow string, a
 * WinMM one is a plain integer, ...) with no single meaningful way to
 * interpret its bytes as text across backends - so we treat it as an
 * opaque blob and hex-encode/decode it wholesale instead.
 *
 * This is the one place responsible for that conversion in both
 * directions: `DeviceEnumeration` encodes IDs when reporting devices to
 * the parent process, and capture session setup decodes them back when
 * the parent process tells us which device to start loopback-capturing.
 */
#pragma once

#include "miniaudio.h"
#include <optional>
#include <string>

namespace VSBloom::Audio {

    std::string                 DeviceIdToHex(const ma_device_id& id);
    std::optional<ma_device_id> DeviceIdFromHex(const std::string& hex);

} // namespace VSBloom::Audio
