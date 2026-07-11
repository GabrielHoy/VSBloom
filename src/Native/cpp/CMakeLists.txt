cmake_minimum_required(VERSION 3.25)

# CMAKE_OSX_DEPLOYMENT_TARGET *must* be set before project() so CMake selects the
# right SDK at configure time on macOS.
# This defines the minimum version of macOS that these native binaries will run on.
if(APPLE)
    set(CMAKE_OSX_DEPLOYMENT_TARGET "13.0" CACHE STRING "Minimum macOS deployment target")
endif()

option(EMULATE_DEBUG_TEST_MESSAGE_ON_STARTUP "Emulate the Native Runtime receiving a `debug-test-message` IPC method invocation at startup, used for testing and iterating on the Native Runtime" OFF)

# We never install ImGui on Release configures, this needs declared before
# project() below since manifest install hooks run at that point.
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    set(VCPKG_MANIFEST_FEATURES "debug-tools")
else()
    if(EMULATE_DEBUG_TEST_MESSAGE_ON_STARTUP)
        message(WARNING "EMULATE_DEBUG_TEST_MESSAGE_ON_STARTUP is enabled, but the Native Runtime is not being built in Debug mode; this option will be ignored.")
        set(EMULATE_DEBUG_TEST_MESSAGE_ON_STARTUP OFF)
    endif()
endif()

# Grab the version string for CMake to use from the `vcpkg.json`
# sibling file in this directory - we'll use its value for our build
# versioning accordingly.
file(READ "${CMAKE_CURRENT_LIST_DIR}/vcpkg.json" VCPKG_JSON_RAW_CONTENT)
string(REGEX MATCH "\"version\"[ \t\r\n]*:[ \t\r\n]*\"([^\"]+)\"" _VERSTR "${VCPKG_JSON_RAW_CONTENT}")
set(VSBLOOM_NATIVE_VERSION "${CMAKE_MATCH_1}")
project(VSBloomNativeRuntime
    VERSION ${VSBLOOM_NATIVE_VERSION}
    LANGUAGES C CXX # C is required for vendor/pffft
)

# Our RC file on Windows requires some variables to be set for versioning & file metadata:
set(VSBLOOM_VERSION_MAJOR ${PROJECT_VERSION_MAJOR})
set(VSBLOOM_VERSION_MINOR ${PROJECT_VERSION_MINOR})
set(VSBLOOM_VERSION_PATCH ${PROJECT_VERSION_PATCH})
set(VSBLOOM_VERSION_BUILD $ENV{GITHUB_RUN_NUMBER})
if(NOT VSBLOOM_VERSION_BUILD) # If we're not running in a CI environment, build defaults to 0
  set(VSBLOOM_VERSION_BUILD 0)
endif()
set(VSBLOOM_VERSION_STRING "${PROJECT_VERSION}")
string(TIMESTAMP VSBLOOM_COPYRIGHT_YEAR "%Y")
if(WIN32)
  set(VSBLOOM_ICON_PATH "${CMAKE_CURRENT_SOURCE_DIR}/../../../imagery/VSBloomNativeRuntime.ico")
  configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/FileMeta.rc.in
    ${CMAKE_CURRENT_BINARY_DIR}/FileMeta.rc
    @ONLY
  )
endif()

# C++ Standards
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)


# We'll utilize sccache for caching compiler invocations to speed up rebuilds
# (If it's present on the system, that is)
find_program(SCCACHE_EXECUTABLE sccache)
if(SCCACHE_EXECUTABLE)
    message(STATUS "Utilizing sccache for compiler invocation caching")
    set(CMAKE_C_COMPILER_LAUNCHER   "${SCCACHE_EXECUTABLE}")
    set(CMAKE_CXX_COMPILER_LAUNCHER "${SCCACHE_EXECUTABLE}")
endif()

# Dependencies - vcpkg managed, check out CMakePresets.json for more details!
find_package(nlohmann_json CONFIG REQUIRED)
find_package(OpenSSL REQUIRED)

# pffft (hayguen/pffft, pinned commit 08f5ed2618ac06d7dcc83d209d7253dc215274d5)
# gets its own tiny static library rather than joining the main SOURCES glob below:
# it's a raw vendored C library with no warning guards etc. - this allows us to build it
# without having to patch the vendored source and maintain our own fork...
add_library(VSBloomPFFFT STATIC
    vendor/pffft/pffft.c
    vendor/pffft/pffft_common.c
)
target_include_directories(VSBloomPFFFT PUBLIC vendor/pffft)
set_target_properties(VSBloomPFFFT PROPERTIES C_STANDARD 11)
if(MSVC)
    target_compile_options(VSBloomPFFFT PRIVATE /W0)
else()
    target_compile_options(VSBloomPFFFT PRIVATE -w)
endif()

#Target sources
file(GLOB_RECURSE SOURCES CONFIGURE_DEPENDS "src/*.cpp")

add_executable(VSBloomNativeRuntime ${SOURCES})

set_target_properties(VSBloomNativeRuntime PROPERTIES OUTPUT_NAME "VSBloomNativeRuntime" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}")

target_include_directories(VSBloomNativeRuntime PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${CMAKE_CURRENT_SOURCE_DIR}/vendor/miniaudio
)

target_link_libraries(VSBloomNativeRuntime PRIVATE
    nlohmann_json::nlohmann_json
    OpenSSL::Crypto
    VSBloomPFFFT
)

# Forward the DEBUG compile definition to the target if we're building
# a Debug-"flavored" build.
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    target_compile_definitions(VSBloomNativeRuntime PRIVATE DEBUG)

    # GLFW/OpenGL3 debug tooling
    find_package(imgui CONFIG REQUIRED)
    find_package(glfw3 CONFIG REQUIRED)
    find_package(OpenGL REQUIRED)
    target_link_libraries(VSBloomNativeRuntime PRIVATE
        imgui::imgui
        glfw
        OpenGL::GL
    )

    target_compile_definitions(VSBloomNativeRuntime PRIVATE DEBUG_WINDOW_ENABLED)

    if(EMULATE_DEBUG_TEST_MESSAGE_ON_STARTUP)
        target_compile_definitions(VSBloomNativeRuntime PRIVATE EMULATE_DEBUG_TEST_MESSAGE_ON_STARTUP)
    endif()
endif()

# Platform-specific audio backend(s) and metadata
if(WIN32)
    target_sources(VSBloomNativeRuntime PRIVATE
        ${CMAKE_CURRENT_BINARY_DIR}/FileMeta.rc
    )

    target_compile_definitions(VSBloomNativeRuntime PRIVATE
        VSBLOOM_AUDIO_BACKEND_WASAPI
        WIN32_LEAN_AND_MEAN
        NOMINMAX
        UNICODE
        _UNICODE

        # DirectSound/WinMM don't support loopback capture,
        # no reason to compile them in as fallback backends.
        MA_NO_DSOUND
        MA_NO_WINMM
    )
    target_link_libraries(VSBloomNativeRuntime PRIVATE
        ole32   # COM initialisation: CoInitializeEx, CoCreateInstance
        avrt    # MMCSS real-time thread priority: AvSetMmThreadCharacteristics
    )
elseif(APPLE)
    find_library(COREAUDIO_LIB CoreAudio REQUIRED)
    find_library(AUDIOTOOLBOX_LIB AudioToolbox REQUIRED)
    target_compile_definitions(VSBloomNativeRuntime PRIVATE VSBLOOM_AUDIO_BACKEND_COREAUDIO)
    target_link_libraries(VSBloomNativeRuntime PRIVATE ${COREAUDIO_LIB} ${AUDIOTOOLBOX_LIB})
else()
    target_compile_definitions(VSBloomNativeRuntime PRIVATE
        VSBLOOM_AUDIO_BACKEND_PULSEAUDIO

        # ALSA/JACK compile into miniaudio by default on Linux, but only
        # PulseAudio's monitor-source model actually works with our capture
        # strategy (see MonitorSourceResolver.cpp) - for now we'll disable
        # the other two backends rather than risk a silent fallback to a
        # backend with no monitor-source concept
        MA_NO_ALSA
        MA_NO_JACK
    )
endif()

# Hardening & Warnings
if(MSVC)
    target_compile_options(VSBloomNativeRuntime PRIVATE
        /W4
        /WX
        /permissive-
        /EHsc
    )
else()
    target_compile_options(VSBloomNativeRuntime PRIVATE
        -Wall
        -Wextra
        -Wpedantic
        -Werror
    )
endif()

# We regenerate `.clangd` from `.clang.in` at configure time to point over to
# the `compile_commands.json` file in the build directory.
set(CLANGD_BUILD_DIR "${CMAKE_BINARY_DIR}")
configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/.clangd.in
    ${CMAKE_CURRENT_SOURCE_DIR}/.clangd
    @ONLY
)

#Our binary should land within `<install-prefix>/bin/vsbloom-native[.exe]`/
install(TARGETS VSBloomNativeRuntime RUNTIME DESTINATION bin)