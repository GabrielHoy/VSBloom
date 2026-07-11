/*
    Contains a function that can be used to perform debug operations on the Native Host.

    This is only accessible in any manner in debug builds (-DDEBUG).
*/
#pragma once

#include <iostream>
#include <nlohmann/json.hpp>
#if defined(DEBUG_WINDOW_ENABLED)
    #include "Debug/Window/MainDebugWindow.hpp"
    #include <thread>
#endif

inline void DebugWindowThread() {
    VSBloom::Debug::DebugWindow debugWindow;
    debugWindow.Run();
}

inline void DebugCallable(const nlohmann::json& message) {
    message.contains("unused");

#if defined(DEBUG_WINDOW_ENABLED)
    std::thread debugWindowThread = std::thread(DebugWindowThread);
    debugWindowThread.detach();
#endif

    std::cerr << "DebugCallable Invoked" << std::endl;
}