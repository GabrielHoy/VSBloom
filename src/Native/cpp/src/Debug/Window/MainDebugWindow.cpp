#include "Debug/Window/Panels/BasePanel.hpp"
#if defined(DEBUG_WINDOW_ENABLED)

    #include "Debug/Spring.hpp"
    #include "ImGui/imconfig.hpp"
    #include "MainDebugWindow.hpp"
    #include "Panels/AudioDebugPanel.hpp"
    #include "Panels/GLFWDebugPanel.hpp"
    #include "Panels/IPCDebugPanel.hpp"
    #include <GLFW/glfw3.h>
    #include <algorithm>
    #include <cmath>
    #include <imgui.h>
    #include <imgui_impl_glfw.h>
    #include <imgui_impl_opengl3.h>
    #include <mutex>

    /**
     * Defines a macro for creating a panel factory function that
     * can be used to create a panel of the given type and return
     * a unique_ptr to it.
     *
     * The macro will expand to a map entry for the `initialPanelFactories` map,
     * which is used to create the initial panels when the debug window is created.
     *
     * @param PANEL_NAME The name of the panel.
     * @param PANEL_CLASS The class of the panel.
     *
     * @return A map entry for the `initialPanelFactories` map.
     */
    #define INITIAL_PANEL_FACTORY(PANEL_NAME, PANEL_CLASS)                                                             \
        {PANEL_NAME, []() -> std::unique_ptr<VSBloom::Debug::PANEL_CLASS> { return std::make_unique<PANEL_CLASS>(); }}

namespace VSBloom::Debug {

    namespace {

        std::unordered_map<std::string, std::function<std::unique_ptr<BasePanel>()>> initialPanelFactories{
            INITIAL_PANEL_FACTORY("audio", AudioDebugPanel),
            INITIAL_PANEL_FACTORY("glfw", GLFWDebugPanel),
            INITIAL_PANEL_FACTORY("ipc", IPCDebugPanel),
        };

        void GlfwErrorCallback(int /*error*/, const char* /*description*/) {
            // Intentionally a no-op, nice spot to drop a breakpoint
        }

        void ComputeInitialWindowPosition(int windowWidth, int windowHeight, int& outX, int& outY) {
            int           monitorCount = 0;
            GLFWmonitor** monitors     = glfwGetMonitors(&monitorCount);

            int maxAreaLeft = 0, maxAreaTop = 0, maxAreaRight = 0, maxAreaBottom = 0;
            for (int i = 0; i < monitorCount; ++i) {
                int monitorX = 0, monitorY = 0;
                glfwGetMonitorPos(monitors[i], &monitorX, &monitorY);
                const GLFWvidmode* mode = glfwGetVideoMode(monitors[i]);
                if (mode == nullptr) {
                    continue;
                }

                maxAreaLeft   = std::min(maxAreaLeft, monitorX);
                maxAreaTop    = std::min(maxAreaTop, monitorY);
                maxAreaRight  = std::max(maxAreaRight, monitorX + mode->width);
                maxAreaBottom = std::max(maxAreaBottom, monitorY + mode->height);
            }

            // Here we're just positioning as close to <x> pixels on the X axis as we can.
            // ...such number is arbitrarily chosen based on what's comfy for my monitor setup, haha
            const int targetX = 6'618;
            const int targetY = 64;

            const int maxDisplayX = maxAreaRight - windowWidth;
            const int maxDisplayY = maxAreaBottom - windowHeight;

            outX = (targetX > maxDisplayX) ? maxDisplayX : targetX;
            outY = (targetY > maxDisplayY) ? maxDisplayY : targetY;
            (void)maxAreaLeft; // only used to compute the bounding box above, not the final position
            (void)maxAreaTop;
        }

    } // namespace

    DebugWindow::DebugWindow() {
        // Must emplace - or insert with a moved unique_ptr - a braced
        // initializer_list would try to copy the unique_ptrs and fail to compile

        for (const auto& [panelName, panelFactory] : initialPanelFactories) {
            panels.emplace(panelName, panelFactory());
        }
    }

    DebugWindow::~DebugWindow() {
    }

    void DebugWindow::Run() {
        glfwSetErrorCallback(GlfwErrorCallback);
        if (!glfwInit()) {
            return;
        }

        glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
        glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
        glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
        glfwWindowHint(GLFW_VISIBLE, GLFW_FALSE);

        constexpr int windowWidth  = 1'024;
        constexpr int windowHeight = 1'024;

        window =
            glfwCreateWindow(windowWidth, windowHeight, "VSBloom Native Runtime: Visual Debugger", nullptr, nullptr);
        if (window == nullptr) {
            glfwTerminate();
            return;
        }

        // Set the window 'user pointer' to the DebugWindow instance,
        // so anything with a reference to the actual GLFW window can
        // access the DebugWindow instance from it accordingly - such
        // as in a GLFW callback, for example...
        glfwSetWindowUserPointer(window, this);

        int windowX = 0, windowY = 0;
        ComputeInitialWindowPosition(windowWidth, windowHeight, windowX, windowY);
        glfwSetWindowPos(window, windowX, windowY);
        glfwShowWindow(window);

        glfwMakeContextCurrent(window);
        glfwSwapInterval(
            1
        ); // VSync is so easy with these graphics APIs. Disturbingly easy comparatively to everything else...

        IMGUI_CHECKVERSION();
        ImGui::CreateContext();

        ImGui::StyleTrueDark(&ImGui::GetStyle());
        ImGui_ImplGlfw_InitForOpenGL(window, true);
        ImGui_ImplOpenGL3_Init("#version 330");

        // Prepare all panels for display -- this is basically their constructor, long-story-short
        for (const auto& [panelName, panel] : panels) {
            panel->PreparePanelForDisplay(this);
        }

        audioPanel = dynamic_cast<AudioDebugPanel*>(panels["audio"].get());

        std::chrono::steady_clock::time_point frameStartTime;
        while (!glfwWindowShouldClose(window)) {
            frameStartTime = std::chrono::steady_clock::now();
            glfwPollEvents();
            RenderFrame();
            const std::chrono::steady_clock::duration timeFrameTook = std::chrono::steady_clock::now() - frameStartTime;

            if (timeFrameTook < timePerFrameNS) {
                std::this_thread::sleep_for(timePerFrameNS - timeFrameTook);
            }
        }

        ImGui_ImplOpenGL3_Shutdown();
        ImGui_ImplGlfw_Shutdown();
        ImGui::DestroyContext();

        glfwDestroyWindow(window);
        glfwTerminate();
    }

    void DebugWindow::RenderFrame() {
        static constexpr float clrColHueChangePerSec   = 0.016f;
        static constexpr float clrColSatAudioAmpEffect = 0.314f;

        ImGui_ImplOpenGL3_NewFrame();
        ImGui_ImplGlfw_NewFrame();
        ImGui::NewFrame();

        for (const auto& [panelName, panel] : panels) {
            panel->DrawUI();
        }

        ImGui::Render();

        clrColHue = std::fmod(clrColHue + clrColHueChangePerSec * ImGui::GetIO().DeltaTime, 1.0f);
        if (audioPanel != nullptr) {
            std::lock_guard<std::mutex> snapshotLock(audioPanel->latestSnapshotMutex);
            clrColValueSpring.SetTarget(
                std::clamp(
                    clrColBaseValue + (audioPanel->latestSnapshot.avgAmplitude * clrColSatAudioAmpEffect),
                    0.0f,
                    1.0f
                )
            );
        }
        clrColValueSpring.Update(ImGui::GetIO().DeltaTime);
        const float clrColCurValue = std::clamp(clrColValueSpring.Value(), 0.0f, 1.0f);

        float clrColR = 0.0f, clrColG = 0.0f, clrColB = 0.0f;
        ImGui::ColorConvertHSVtoRGB(clrColHue, clrColSaturation, clrColCurValue, clrColR, clrColG, clrColB);

        int displayWidth = 0, displayHeight = 0;
        glfwGetFramebufferSize(window, &displayWidth, &displayHeight);
        glViewport(0, 0, displayWidth, displayHeight);
        glClearColor(clrColR, clrColG, clrColB, 1.0f);
        glClear(GL_COLOR_BUFFER_BIT);
        ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());

        glfwSwapBuffers(window);
    }

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
