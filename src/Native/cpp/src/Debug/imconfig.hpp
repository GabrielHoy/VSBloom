/**
 * Extra/Custom ImGui functions that are not part of the official ImGui library,
 * used for niceties & QOL while writing the VSBloom Debug Window.
 */
#pragma once

#if defined(DEBUG_WINDOW_ENABLED)

struct ImVec2;
struct ImVec4;
struct ImGuiStyle;

namespace ImGui {

    float  GetButtonSize();
    ImVec2 GetButtonSizeVec();
    void   CenteredText(const char* text);
    void   CenteredTextColored(ImVec4 textColor, const char* text);
    float  SameLineRightSide(float objectSizeOffsetFromRight);
    void   StyleTrueDark(ImGuiStyle* dst);

} // namespace ImGui

#endif // defined(DEBUG_WINDOW_ENABLED)