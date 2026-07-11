/**
 * Base class for ImGui panels hosted by the DebugWindow.
 *
 * (There won't be much more framework for debugging/windowing,
 * this is already a bit overengineered in a not great way.)
 */
#pragma once

#if defined(DEBUG_WINDOW_ENABLED)

namespace VSBloom::Debug {

    class DebugWindow;

    class BasePanel {
      public:
        BasePanel()          = default;
        virtual ~BasePanel() = default;

        void PreparePanelForDisplay(DebugWindow* debugWindow) {
            mainWindow = debugWindow;
            Initialize();
        }

        virtual void DrawUI() = 0;

      protected:
        DebugWindow* mainWindow = nullptr;

      private:
        virtual void Initialize() = 0;
    };

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
