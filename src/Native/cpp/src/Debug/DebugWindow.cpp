#if defined(DEBUG_WINDOW_ENABLED)

    #include "DebugWindow.hpp"
    #include "Audio/CaptureManager.hpp"
    #include "Audio/Device/AudioDevice.hpp"
    #include "Audio/Device/DeviceEnumeration.hpp"
    #include "Spring.hpp"
    #include "imconfig.hpp"
    #include <algorithm>
    #include <d3d11.h>
    #include <imgui.h>
    #include <imgui_impl_dx11.h>
    #include <imgui_impl_win32.h>
    #include <mutex>
    #include <string>
    #include <tchar.h>
    #include <unordered_map>
    #include <vector>

extern IMGUI_IMPL_API LRESULT ImGui_ImplWin32_WndProcHandler(HWND, UINT, WPARAM, LPARAM);

namespace VSBloom::Debug {

    namespace {

        // Minimal D3D11 device/swapchain plumbing - lifted straight
        // from Dear ImGui's example_win32_directx11
        ID3D11Device*           g_pd3dDevice           = nullptr;
        ID3D11DeviceContext*    g_pd3dDeviceContext    = nullptr;
        IDXGISwapChain*         g_pSwapChain           = nullptr;
        ID3D11RenderTargetView* g_mainRenderTargetView = nullptr;

        void CreateRenderTarget() {
            ID3D11Texture2D* backBuffer = nullptr;
            g_pSwapChain->GetBuffer(0, IID_PPV_ARGS(&backBuffer));
            g_pd3dDevice->CreateRenderTargetView(backBuffer, nullptr, &g_mainRenderTargetView);
            backBuffer->Release();
        }

        void CleanupRenderTarget() {
            if (g_mainRenderTargetView) {
                g_mainRenderTargetView->Release();
                g_mainRenderTargetView = nullptr;
            }
        }

        bool CreateDeviceD3D(HWND hWnd) {
            DXGI_SWAP_CHAIN_DESC sd{};
            sd.BufferCount       = 2;
            sd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
            sd.BufferUsage       = DXGI_USAGE_RENDER_TARGET_OUTPUT;
            sd.OutputWindow      = hWnd;
            sd.SampleDesc.Count  = 1;
            sd.Windowed          = TRUE;
            sd.SwapEffect        = DXGI_SWAP_EFFECT_DISCARD;

            D3D_FEATURE_LEVEL       featureLevel;
            const D3D_FEATURE_LEVEL featureLevelArray[2] = {D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_0};
            const HRESULT           hr                   = D3D11CreateDeviceAndSwapChain(
                nullptr,
                D3D_DRIVER_TYPE_HARDWARE,
                nullptr,
                0,
                featureLevelArray,
                2,
                D3D11_SDK_VERSION,
                &sd,
                &g_pSwapChain,
                &g_pd3dDevice,
                &featureLevel,
                &g_pd3dDeviceContext
            );
            if (FAILED(hr)) {
                return false;
            }

            CreateRenderTarget();
            return true;
        }

        void CleanupDeviceD3D() {
            CleanupRenderTarget();
            if (g_pSwapChain) {
                g_pSwapChain->Release();
                g_pSwapChain = nullptr;
            }
            if (g_pd3dDeviceContext) {
                g_pd3dDeviceContext->Release();
                g_pd3dDeviceContext = nullptr;
            }
            if (g_pd3dDevice) {
                g_pd3dDevice->Release();
                g_pd3dDevice = nullptr;
            }
        }

        LRESULT CALLBACK WndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) {
            if (ImGui_ImplWin32_WndProcHandler(hWnd, msg, wParam, lParam)) {
                return true;
            }

            switch (msg) {
                case WM_SIZE:
                    if (g_pd3dDevice != nullptr && wParam != SIZE_MINIMIZED) {
                        CleanupRenderTarget();
                        g_pSwapChain->ResizeBuffers(
                            0,
                            static_cast<UINT>(LOWORD(lParam)),
                            static_cast<UINT>(HIWORD(lParam)),
                            DXGI_FORMAT_UNKNOWN,
                            0
                        );
                        CreateRenderTarget();
                    }
                    return 0;
                case WM_DESTROY:
                    ::PostQuitMessage(0);
                    return 0;
                default:
                    break;
            }
            return ::DefWindowProc(hWnd, msg, wParam, lParam);
        }

        // The actual debug window class and its associated state
        class AudioDebugState {
          private:
            Audio::CaptureManager captureManager;

            std::vector<Audio::AudioDevice>       devices;
            std::unordered_map<std::string, bool> selectedDeviceIds;
            std::mutex                            deviceChangeMutex;

            void ApplySelectionToCaptureManager() {
                std::vector<std::string> desiredDeviceIds;
                for (const auto& entry : selectedDeviceIds) {
                    if (entry.second) {
                        desiredDeviceIds.push_back(entry.first);
                    }
                }
                captureManager.UpdateCurrentCapturedDevices(desiredDeviceIds);
            }

          public:
            std::mutex                   latestSnapshotMutex;
            Audio::AudioAnalysisSnapshot latestSnapshot;

            AudioDebugState() {
                captureManager.SetOnFrameAggregatedCallback([this](const Audio::AudioAnalysisSnapshot& snapshot) {
                    std::lock_guard<std::mutex> lock(latestSnapshotMutex);
                    latestSnapshot = snapshot;
                });
                RefreshDeviceList();
            }

            void RefreshDeviceList() {
                std::lock_guard<std::mutex> deviceChangeLock(deviceChangeMutex);

                devices = Audio::EnumerateAudioDevices();
                for (const Audio::AudioDevice& device : devices) {
                    selectedDeviceIds.try_emplace(device.id, false);
                }
            }

            void DrawUI() {
                Audio::AudioAnalysisSnapshot aggregatedSnapshot;
                {
                    ImGui::Begin("Audio Device Enumeration");

                    ImGui::Separator();

                    ImGui::Text("Render Devices:");

                    ImGui::Spacing();
                    if (ImGui::Button("Refresh")) {
                        RefreshDeviceList();
                    }
                    ImGui::Spacing();

                    for (const Audio::AudioDevice& device : devices) {
                        bool&             selected = selectedDeviceIds[device.id];
                        const std::string label    = device.name + (device.isDefault ? " (default)" : "");
                        if (ImGui::Checkbox(label.c_str(), &selected)) {
                            ApplySelectionToCaptureManager();
                        }
                    }

                    ImGui::Separator();

                    {
                        std::lock_guard<std::mutex> lock(latestSnapshotMutex);
                        aggregatedSnapshot = latestSnapshot;
                    }

                    ImGui::End();
                }

                {
                    ImGui::Begin("Audio Aggregation");

                    ImGui::Text("Merged avg. amplitude: %.4f", aggregatedSnapshot.avgAmplitude);
                    ImGui::ProgressBar(std::clamp(aggregatedSnapshot.avgAmplitude, 0.0f, 1.0f), ImVec2(-1.0f, 0.0f));

                    ImGui::Text("Merged FFT bins (placeholder):");
                    ImGui::PlotHistogram(
                        "##fftBins",
                        aggregatedSnapshot.fftBins.data(),
                        static_cast<int>(aggregatedSnapshot.fftBins.size()),
                        0,
                        nullptr,
                        0.0f,
                        1.0f,
                        ImVec2(0, 120)
                    );

                    ImGui::End();
                }
            }
        };

    } // namespace

    void RunAudioDebugWindow() {
        WNDCLASSEX wc = {
            sizeof(WNDCLASSEX),
            CS_CLASSDC,
            WndProc,
            0L,
            0L,
            GetModuleHandle(nullptr),
            nullptr,
            nullptr,
            nullptr,
            nullptr,
            _T("VSBloomNativeRuntimeDebugWindow"),
            nullptr
        };
        ::RegisterClassEx(&wc);

        // Here we're just positioning as close to 4,096px on the X axis as we can.
        // ...such number is arbitrarily chosen based on what's comfy formy monitor setup, haha
        int targetX      = 4'096; //+ (1'024);
        int targetY      = 16;
        int windowWidth  = 1'024;
        int windowHeight = 1'024;

        RECT maxArea         = {0, 0, 0, 0};
        auto MonitorEnumProc = [](HMONITOR, HDC, LPRECT lprcMonitor, LPARAM lParam) -> BOOL {
            RECT* pMaxArea = reinterpret_cast<RECT*>(lParam);
            if (lprcMonitor->right > pMaxArea->right) {
                pMaxArea->right = lprcMonitor->right;
            }
            if (lprcMonitor->bottom > pMaxArea->bottom) {
                pMaxArea->bottom = lprcMonitor->bottom;
            }
            if (lprcMonitor->left < pMaxArea->left) {
                pMaxArea->left = lprcMonitor->left;
            }
            if (lprcMonitor->top < pMaxArea->top) {
                pMaxArea->top = lprcMonitor->top;
            }
            return TRUE;
        };
        maxArea.left = GetSystemMetrics(SM_XVIRTUALSCREEN);
        maxArea.top  = GetSystemMetrics(SM_YVIRTUALSCREEN);
        EnumDisplayMonitors(nullptr, nullptr, MonitorEnumProc, reinterpret_cast<LPARAM>(&maxArea));
        int maxDisplayX = maxArea.right - windowWidth;
        int maxDisplayY = maxArea.bottom - windowHeight;

        int windowX = (targetX > maxDisplayX) ? maxDisplayX : targetX;
        int windowY = (targetY > maxDisplayY) ? maxDisplayY : targetY;

        const HWND hwnd = ::CreateWindow(
            wc.lpszClassName,
            _T("VSBloom Native Runtime: Visual Debugger"),
            WS_OVERLAPPEDWINDOW,
            windowX,
            windowY,
            windowWidth,
            windowHeight,
            nullptr,
            nullptr,
            wc.hInstance,
            nullptr
        );

        if (!CreateDeviceD3D(hwnd)) {
            CleanupDeviceD3D();
            ::UnregisterClass(wc.lpszClassName, wc.hInstance);
            return;
        }

        ::ShowWindow(hwnd, SW_SHOWDEFAULT);
        ::UpdateWindow(hwnd);

        IMGUI_CHECKVERSION();
        ImGui::CreateContext();

        ImGui::StyleTrueDark(&ImGui::GetStyle());
        ImGui_ImplWin32_Init(hwnd);
        ImGui_ImplDX11_Init(g_pd3dDevice, g_pd3dDeviceContext);

        AudioDebugState debugState;

        static float           clrColHue               = 0.60;
        static float           clrColSaturation        = 0.58;
        float                  clrColBaseValue         = 0.075;
        static constexpr float clrColHueChangePerSec   = 0.016f;
        static constexpr float clrColSatAudioAmpEffect = 0.314f;
        Spring                 clrColValueSpring       = Spring::SnappyPreset(0.0f);

        float clrColR = 0.0f, clrColG = 0.0f, clrColB = 0.0f;
        bool  windowQuitReceived = false;
        while (!windowQuitReceived) {
            MSG msg;
            while (::PeekMessage(&msg, nullptr, 0U, 0U, PM_REMOVE)) {
                ::TranslateMessage(&msg);
                ::DispatchMessage(&msg);
                if (msg.message == WM_QUIT) {
                    windowQuitReceived = true;
                }
            }
            if (windowQuitReceived) {
                break;
            }

            ImGui_ImplDX11_NewFrame();
            ImGui_ImplWin32_NewFrame();
            ImGui::NewFrame();

            debugState.DrawUI();

            ImGui::Render();

            clrColHue = std::fmod(clrColHue + clrColHueChangePerSec * ImGui::GetIO().DeltaTime, 1.0f);
            {
                std::lock_guard<std::mutex> snapshotLock(debugState.latestSnapshotMutex);
                clrColValueSpring.SetTarget(
                    std::clamp(
                        clrColBaseValue + (debugState.latestSnapshot.avgAmplitude * clrColSatAudioAmpEffect),
                        0.0f,
                        1.0f
                    )
                );
            }
            clrColValueSpring.Update(ImGui::GetIO().DeltaTime);
            const float clrColCurValue = std::clamp(clrColValueSpring.Value(), 0.0f, 1.0f);
            ImGui::ColorConvertHSVtoRGB(clrColHue, clrColSaturation, clrColCurValue, clrColR, clrColG, clrColB);

            const float clearColor[4] = {clrColR, clrColG, clrColB, 1.0f};
            g_pd3dDeviceContext->OMSetRenderTargets(1, &g_mainRenderTargetView, nullptr);
            g_pd3dDeviceContext->ClearRenderTargetView(g_mainRenderTargetView, clearColor);
            ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());

            g_pSwapChain->Present(1, 0);
        }

        ImGui_ImplDX11_Shutdown();
        ImGui_ImplWin32_Shutdown();
        ImGui::DestroyContext();

        CleanupDeviceD3D();
        ::DestroyWindow(hwnd);
        ::UnregisterClass(wc.lpszClassName, wc.hInstance);
    }

} // namespace VSBloom::Debug

#endif // defined(DEBUG_WINDOW_ENABLED)
