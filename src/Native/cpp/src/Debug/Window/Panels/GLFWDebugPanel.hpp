/**
 * Window Debug Panel
 *
 * Debugging related to the GLFW/OpenGL window that hosts the ImGui content
 * for the Debug window (Are we really debugging the debugger here?)
 */
#pragma once

#include "Debug/Window/Panels/BasePanel.hpp"
#if defined(DEBUG_WINDOW_ENABLED)

struct GLFWwindow;

namespace VSBloom::Debug {

    class GLFWDebugPanel final : public BasePanel {
      public:

        GLFWDebugPanel();
        ~GLFWDebugPanel();

        /**
         * Draws this frame's ImGui content. Must be called between
         * ImGui::NewFrame() and ImGui::Render().
         */
        void DrawUI() override;

      private:
        virtual void Initialize() override;

        struct WindowPosition {
            int x;
            int y;
        } windowPos;
        
        struct WindowSize {
            int width;
            int height;
        } windowSize;

        static void WindowPositionChangedGLFWCallback(GLFWwindow* window, int x, int y);
        static void WindowSizeChangedGLFWCallback(GLFWwindow* window, int width, int height);
    };

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
