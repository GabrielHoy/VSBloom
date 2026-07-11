/**
 * Window Debug Panel
 *
 * Debugging related to the GLFW/OpenGL window that hosts the ImGui content
 * for the Debug window (Are we really debugging the debugger here?)
 */
#pragma once

#if defined(DEBUG_WINDOW_ENABLED)

struct GLFWwindow;

namespace VSBloom::Debug {

    class GLFWDebugPanel {
      public:
        GLFWDebugPanel(GLFWwindow* windowHandle);

        /**
         * Draws this frame's ImGui content. Must be called between
         * ImGui::NewFrame() and ImGui::Render().
         */
        void DrawUI();

      private:
        GLFWwindow* window;

        struct WindowPosition {
            int x;
            int y;
        } windowPos;

        static void WindowPositionChangedGLFWCallback(GLFWwindow* window, int x, int y);
    };

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
