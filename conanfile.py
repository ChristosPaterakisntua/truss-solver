from conan import ConanFile
from conan.tools.build import check_min_cppstd
from conan.tools.cmake import CMake, cmake_layout
from conan.tools.files import copy
import os

required_conan_version = ">=2.0.0"


class TrussSolverConan(ConanFile):
    name = "truss-solver"
    version = "1.0.0"

    license = "MIT"
    homepage = "https://github.com/ChristosPaterakisntua/truss-solver"
    url = "https://github.com/ChristosPaterakisntua/truss-solver"
    description = "2D planar truss solver library (with optional WebAssembly bindings)."
    topics = ("truss", "structural-engineering", "solver", "webassembly")

    package_type = "library"
    options = {"shared": [True, False]}
    default_options = {"shared": False}

    # ConanCenter convention: restrict to top-level settings only. Sub-settings
    # such as compiler.cppstd / compiler.runtime are then accepted implicitly.
    settings = "os", "arch", "compiler", "build_type"

    # Only native code is packaged; the WebAssembly target is not built by
    # this recipe (a C++ compiler is expected, not the Emscripten toolchain).
    exports_sources = "CMakeLists.txt", "cmake/*", "solver/*", "examples/*", "LICENSE"

    generators = "CMakeToolchain"

    def layout(self):
        cmake_layout(self)

    def validate(self):
        check_min_cppstd(self, "17")

    def build(self):
        cmake = CMake(self)
        # Build the library according to the "shared" option (static by default).
        shared = "ON" if self.options.shared else "OFF"
        cmake.configure(cli_args=["-DBUILD_SHARED_LIBS={}".format(shared)])
        cmake.build()

    def package(self):
        cmake = CMake(self)
        cmake.install()
        # License is expected at <prefix>/licenses/<name> for ConanCenter.
        copy(self, "LICENSE", src=self.source_folder,
             dst=os.path.join(self.package_folder, "licenses"))

    def package_info(self):
        # Make the installed package discoverable via find_package(truss_solver)
        # and consumable with target_link_libraries(yourapp truss_solver::truss_solver).
        self.cpp_info.set_property("cmake_file_name", "truss_solver")
        self.cpp_info.set_property("cmake_target_name", "truss_solver::truss_solver")
        self.cpp_info.set_property("pkg_config_name", "truss-solver")
        self.cpp_info.libs = ["truss_solver"]
        self.cpp_info.includedirs = ["include/truss_solver"]