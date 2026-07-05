#include <emscripten/bind.h>
#include "TrussSolver.hpp"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(truss_solver_module) {
    class_<TrussSolver>("TrussSolver")
        .constructor<>()
        .function("clear", &TrussSolver::clear)
        .function("addNode", &TrussSolver::addNode)
        .function("addBar", &TrussSolver::addBar)
        .function("addForce", &TrussSolver::addForce)
        .function("addScrolling", &TrussSolver::addScrolling)
        .function("addJoint", &TrussSolver::addJoint)
        .function("solve", &TrussSolver::solve)
        .function("resultsAsJson", &TrussSolver::resultsAsJson);
}