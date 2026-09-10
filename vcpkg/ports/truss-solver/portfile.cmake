# vcpkg port for truss-solver.
# Current source is fetched from the upstream GitHub repository.
#
# NOTE:
#   - Set REF to the tag/commit you want to distribute ("main" while no tags exist yet).
#   - Set SHA512 to the value printed by:  vcpkg x-update-baseline / vcpkg x-fetch-port
#     For local development testing you may use SHA512 0.
#   - This port builds the native (CPU) library; the WebAssembly target is not built.

vcpkg_from_github(
    OUT_SOURCE_PATH SOURCE_PATH
    REPO ChristosPaterakisntua/truss-solver
    REF main
    SHA512 0
    HEAD_REF main
)

vcpkg_cmake_configure(
    SOURCE_PATH "${SOURCE_PATH}"
    OPTIONS
        -DBUILD_SHARED_LIBS=OFF
)

vcpkg_cmake_install()
vcpkg_copy_pdbs()

# Install license where vcpkg expects it.
set(VCPKG_POLICY_LICENSE_CONFORMANCE enabled)
vcpkg_install_copyright(FILE_LIST "${SOURCE_PATH}/LICENSE")