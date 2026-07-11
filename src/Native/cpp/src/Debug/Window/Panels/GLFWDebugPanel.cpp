#if defined(DEBUG_WINDOW_ENABLED)

    #include "GLFWDebugPanel.hpp"
    #include "Debug/Window/MainDebugWindow.hpp"
    #include <GLFW/glfw3.h>
    #include <imgui.h>

namespace VSBloom::Debug {

    GLFWDebugPanel::GLFWDebugPanel()
        : BasePanel() {
    }

    GLFWDebugPanel::~GLFWDebugPanel() {
    }

    void GLFWDebugPanel::Initialize() {
        glfwSetWindowPosCallback(mainWindow->window, WindowPositionChangedGLFWCallback);
        glfwGetWindowPos(mainWindow->window, &windowPos.x, &windowPos.y);
        glfwGetWindowSize(mainWindow->window, &windowSize.width, &windowSize.height);
        glfwSetWindowSizeCallback(mainWindow->window, WindowSizeChangedGLFWCallback);
    }

    void GLFWDebugPanel::WindowPositionChangedGLFWCallback(GLFWwindow* window, int x, int y) {
        DebugWindow* debugWindow = static_cast<DebugWindow*>(glfwGetWindowUserPointer(window));

        GLFWDebugPanel* debugPanelForWindow = dynamic_cast<GLFWDebugPanel*>(debugWindow->panels["glfw"].get());
        if (debugPanelForWindow == nullptr) {
            return;
        }

        debugPanelForWindow->windowPos.x = x;
        debugPanelForWindow->windowPos.y = y;
    }

    void GLFWDebugPanel::WindowSizeChangedGLFWCallback(GLFWwindow* window, int width, int height) {
        DebugWindow* debugWindow = static_cast<DebugWindow*>(glfwGetWindowUserPointer(window));

        GLFWDebugPanel* debugPanelForWindow = dynamic_cast<GLFWDebugPanel*>(debugWindow->panels["glfw"].get());
        if (debugPanelForWindow == nullptr) {
            return;
        }

        debugPanelForWindow->windowSize.width  = width;
        debugPanelForWindow->windowSize.height = height;
    }

    void GLFWDebugPanel::DrawUI() {
        ImGui::Begin("GLFW");

        ImGui::BulletText("Position: (%d, %d)", windowPos.x, windowPos.y);
        ImGui::BulletText("Size: (%d, %d)", windowSize.width, windowSize.height);

        ImGui::End();
    }

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
