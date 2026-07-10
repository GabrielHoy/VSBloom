/*
    Contains a function that can be used to perform debug operations on the Native Host.

    This is only accessible in any manner in debug builds (-DDEBUG).
*/
#pragma once

#include <iostream>
#include <nlohmann/json.hpp>
#if defined(DEBUG_WINDOW_ENABLED)
    #include "Debug/DebugWindow.hpp"
    #include <thread>
#endif

inline void DebugCallable(const nlohmann::json& message) {
    message.contains("unused");

#if defined(DEBUG_WINDOW_ENABLED)
    std::thread audioDbgWindowThread = std::thread(VSBloom::Debug::RunAudioDebugWindow);
    audioDbgWindowThread.detach();
#endif

    std::cerr << "DebugCallable Invoked" << std::endl;
}