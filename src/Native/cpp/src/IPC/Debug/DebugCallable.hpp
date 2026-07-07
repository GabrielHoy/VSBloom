/*
    Contains a function that can be used to perform debug operations on the Native Host.

    This is only accessible in any manner in debug builds (-DDEBUG).
*/
#pragma once

#include "Audio/DeviceEnumeration.hpp"
#include <iostream>
#include <nlohmann/json.hpp>

inline void DebugCallable(const nlohmann::json& message) {
    message.contains("unused");

    const std::vector<VSBloom::Audio::AudioDevice> audioDevices = VSBloom::Audio::EnumerateAudioDevices();

    std::cerr << "DebugCallable Invoked" << std::endl;
}