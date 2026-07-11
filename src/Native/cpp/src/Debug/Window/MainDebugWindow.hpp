/**
 * Debug Visualization Window
 *
 * Only compiled into builds in Debug configurations, this is a small
 * ImGui / GLFW / OpenGL3 window for visually verifying that complex data
 * is being processed correctly by the runtime.
 *
 * The DebugWindow is going to be hacked on a lot, expect messy code here.
 */
#pragma once

#if defined(DEBUG_WINDOW_ENABLED)

    #include "Panels/BasePanel.hpp"
    #include <memory>
    #include <string>
    #include <unordered_map>

struct GLFWwindow;

namespace VSBloom::Debug {

    class DebugWindow {
      public:
        DebugWindow();
        ~DebugWindow();

        // Polymorphic panel map, populated in the constructor via emplace
        // since brace-init with unique_ptr's makes initializer list move
        // attempts scream from deep within `xmemory`.
        std::unordered_map<std::string, std::unique_ptr<BasePanel>> panels;

        /**
         * Kicks off the debug window's main loop and instantiates the GLFW window.
         *
         * Blocks the calling thread while the debug window is running.
         */
        void Run();

        GLFWwindow* window = nullptr;
    };

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
