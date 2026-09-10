cmake_minimum_required(VERSION 3.20)

project(TrussSolver
    VERSION 1.0.0
    DESCRIPTION "2D planar truss solver"
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Library

add_library(truss_solver
    solver/Point.cpp
    solver/Node.cpp
    solver/Force.cpp
    solver/Graph.cpp
    solver/TrussSolver.cpp
)

target_sources(truss_solver PRIVATE
    solver/Point.hpp
    solver/Node.hpp
    solver/Force.hpp
    solver/Graph.hpp
    solver/TrussSolver.hpp
)

target_include_directories(truss_solver
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/solver>
        $<INSTALL_INTERFACE:include/truss_solver>
)

# Native demo executable (build only when NOT targeting Emscripten)

if (NOT EMSCRIPTEN)
    add_executable(truss_solver_demo
        examples/main_example.cpp
    )
    target_link_libraries(truss_solver_demo
        PRIVATE
            truss_solver
    )
endif()

# Wasm build

if (EMSCRIPTEN) 

    add_executable(truss_solver_wasm
        solver/bindings.cpp
    )

    target_link_libraries(truss_solver_wasm
        PRIVATE
            truss_solver
    )

    target_compile_options(truss_solver_wasm
        PRIVATE
            -fexceptions
    )

    target_link_options(truss_solver_wasm
        PRIVATE
            -lembind
            -sDISABLE_EXCEPTION_CATCHING=0
            -sASSERTIONS=2
            -sSAFE_HEAP=1
            -sALLOW_MEMORY_GROWTH=1
            -sENVIRONMENT=web
    )

    set_target_properties(truss_solver_wasm PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY
            ${CMAKE_CURRENT_SOURCE_DIR}/web
        OUTPUT_NAME truss_solver
    )

endif()

# Install (native use of the library)

include(GNUInstallDirs)

install(TARGETS truss_solver
    EXPORT truss_solverTargets
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)

install(FILES
    solver/Point.hpp
    solver/Node.hpp
    solver/Force.hpp
    solver/Graph.hpp
    solver/TrussSolver.hpp
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/truss_solver
)

install(EXPORT truss_solverTargets
    FILE truss_solverTargets.cmake
    NAMESPACE truss_solver::
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/truss_solver
)

# Package config files - enable: find_package(truss_solver CONFIG REQUIRED)

include(CMakePackageConfigHelpers)

write_basic_package_version_file(
    "${CMAKE_CURRENT_BINARY_DIR}/truss_solver-config-version.cmake"
    VERSION ${PROJECT_VERSION}
    COMPATIBILITY SameMajorVersion
)

configure_package_config_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/cmake/truss_solver-config.cmake.in"
    "${CMAKE_CURRENT_BINARY_DIR}/truss_solver-config.cmake"
    INSTALL_DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/truss_solver
)

install(FILES
    "${CMAKE_CURRENT_BINARY_DIR}/truss_solver-config.cmake"
    "${CMAKE_CURRENT_BINARY_DIR}/truss_solver-config-version.cmake"
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/truss_solver
)