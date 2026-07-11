/**
 * Window Debug Panel
 *
 * Debugging related to the GLFW/OpenGL window that hosts the ImGui content
 * for the Debug window (Are we really debugging the debugger here?)
 */
#pragma once

#if defined(DEBUG_WINDOW_ENABLED)

    #include "Debug/Window/Panels/BasePanel.hpp"
    #include "IPC/IPCSendables.hpp"
    #include <functional>
    #include <string>
    #include <unordered_map>

namespace VSBloom::Debug {

    using IPCSendableGenerator_t = std::function<IPC::IPCSendable()>;

    class IPCDebugPanel final : public BasePanel {
      public:

        IPCDebugPanel();
        ~IPCDebugPanel();

        /**
         * Draws this frame's ImGui content. Must be called between
         * ImGui::NewFrame() and ImGui::Render().
         */
        void DrawUI() override;

      private:
        std::unordered_map<std::string, IPCSendableGenerator_t> sendableGenerators;
        void RegisterNewSendableGenerator(const std::string& name, IPCSendableGenerator_t generator);

        virtual void Initialize() override;
    };

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
