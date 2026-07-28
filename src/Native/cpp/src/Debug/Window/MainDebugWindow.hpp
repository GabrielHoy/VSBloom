/**
 * Debug Visualization Window
 *
 * Only compiled into builds in Debug configurations, this is a small
 * ImGui / GLFW / OpenGL3 window for visually verifying that complex data
 * is being processed correctly by the runtime.
 *
 * The DebugWindow is going to be hacked on a lot, expect messy code here.
 *
 * NOTE: There's a persistently pesky bug on Win32 where resizing a window
 * for some reason desyncs with Windows' DWM and the window content appears
 * as a static white rectangle the size of the previous viewport - if this
 * occurs, just minimize and restore the window & all functionality, including
 * resizing, should work properly. It's not worth spending more time hunting this
 * down at the moment.
 */
#pragma once

#if defined(DEBUG_WINDOW_ENABLED)

    #include "Debug/Spring.hpp"
    #include "Panels/BasePanel.hpp"
    #include <chrono>
    #include <memory>
    #include <string>
    #include <unordered_map>

struct GLFWwindow;

namespace VSBloom::Debug {

    class AudioDebugPanel;

    class DebugWindow {
      public:
        DebugWindow();
        ~DebugWindow();

        // Polymorphic panel map, populated in the constructor via emplace
        // based upon the entries in `panelFactories` since brace-init with
        // unique_ptr's directly makes initializer list move attempts scream
        // from deep within `xmemory`.
        std::unordered_map<std::string, std::unique_ptr<BasePanel>> panels;

        /**
         * Kicks off the debug window's main loop and instantiates the GLFW window.
         *
         * Blocks the calling thread while the debug window is running.
         */
        void Run();

        GLFWwindow* window = nullptr;

        std::chrono::nanoseconds timePerFrameNS = std::chrono::nanoseconds(std::chrono::milliseconds(50));

      private:
        // Draws + presents exactly one frame.
        void RenderFrame();

        AudioDebugPanel* audioPanel = nullptr; // cached from panels["audio"] once Run() starts

        float  clrColHue         = 0.60f;
        float  clrColSaturation  = 0.58f;
        float  clrColBaseValue   = 0.075f;
        Spring clrColValueSpring = Spring::SnappyPreset(0.0f);
    };

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
