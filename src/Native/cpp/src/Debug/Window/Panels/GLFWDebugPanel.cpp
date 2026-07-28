#if defined(DEBUG_WINDOW_ENABLED)

    #include "GLFWDebugPanel.hpp"
    #include "Debug/Window/MainDebugWindow.hpp"
    #include <GLFW/glfw3.h>
    #include <chrono>
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

        // Take the main window's timePerFrameNS and convert it to actualFPS
        int maxFPS = static_cast<int>(1'000'000'000.0 / static_cast<double>(mainWindow->timePerFrameNS.count()));
        ImGui::Bullet();
        ImGui::SameLine();
        if (ImGui::SliderInt("##maxWindowFPS", &maxFPS, 1, 240, "Max FPS: %d", ImGuiSliderFlags_AlwaysClamp)) {
            // Convert the actualFPS back to timePerFrameNS for when we update it on the main window
            mainWindow->timePerFrameNS =
                std::chrono::nanoseconds(static_cast<uint64_t>((1.0 / static_cast<double>(maxFPS)) * 1'000'000'000.0));
        }

        ImGui::End();
    }

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
