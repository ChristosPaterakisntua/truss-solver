#include "TrussSolver.hpp"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <stdexcept>

void TrussSolver::ensureNodeExists(int id) const {
    if (nodeIds_.find(id) == nodeIds_.end()) {
        throw std::runtime_error("Node id does not exist: " + std::to_string(id));
    }
}

bool TrussSolver::barExists(int a, int b) const {
    for (const auto& bar : bars_) {
        if ((bar.from == a && bar.to == b) || (bar.from == b && bar.to == a)) {
            return true;
        }
    }
    return false;
}

void TrussSolver::upsertSupport(int nodeId, bool isJoint, double theta) {
    auto it = std::find_if(
        supports_.begin(),
        supports_.end(),
        [nodeId](const TrussSupportInput& s) { return s.nodeId == nodeId; }
    );

    TrussSupportInput s;
    s.nodeId = nodeId;
    s.isJoint = isJoint;
    s.theta = theta;

    if (it != supports_.end()) {
        *it = s;
    } else {
        supports_.push_back(s);
    }
}

void TrussSolver::clear() {
    nodes_.clear();
    bars_.clear();
    forces_.clear();
    supports_.clear();
    nodeIds_.clear();
    originalForceCountByNode_.clear();
    barResults_.clear();
    forceResults_.clear();
    solved_ = false;
}

void TrussSolver::addNode(int id, double x, double y) {
    if (!std::isfinite(x) || !std::isfinite(y)) {
        throw std::runtime_error("Node coordinates must be finite.");
    }
    if (nodeIds_.count(id)) {
        throw std::runtime_error("Duplicate node id: " + std::to_string(id));
    }

    nodes_.push_back({id, x, y});
    nodeIds_.insert(id);
    solved_ = false;
}

void TrussSolver::addBar(int a, int b) {
    if (a == b) {
        throw std::runtime_error("A bar cannot connect a node to itself.");
    }
    ensureNodeExists(a);
    ensureNodeExists(b);

    if (barExists(a, b)) {
        throw std::runtime_error("Duplicate bar: " + std::to_string(a) + " - " + std::to_string(b));
    }

    bars_.push_back({a, b});
    solved_ = false;
}

void TrussSolver::addForce(int nodeId, double magnitude, double angleRad) {
    ensureNodeExists(nodeId);

    if (!std::isfinite(magnitude) || !std::isfinite(angleRad)) {
        throw std::runtime_error("Force magnitude and angle must be finite.");
    }

    forces_.push_back({nodeId, magnitude, angleRad});
    originalForceCountByNode_[nodeId] += 1;
    solved_ = false;
}

void TrussSolver::addScrolling(int nodeId, double theta) {
    ensureNodeExists(nodeId);

    if (!std::isfinite(theta)) {
        throw std::runtime_error("Support angle must be finite.");
    }

    upsertSupport(nodeId, false, theta);
    solved_ = false;
}

void TrussSolver::addJoint(int nodeId, double theta) {
    ensureNodeExists(nodeId);

    if (!std::isfinite(theta)) {
        throw std::runtime_error("Support angle must be finite.");
    }

    upsertSupport(nodeId, true, theta);
    solved_ = false;
}

void TrussSolver::solve() {
    if (nodes_.empty()) {
        throw std::runtime_error("No nodes have been added.");
    }

    Graph graph;

    for (const auto& n : nodes_) {
        graph.addNode(Node(n.id, n.x, n.y));
    }

    for (const auto& b : bars_) {
        graph.addBar(b.from, b.to);
    }

    for (const auto& f : forces_) {
        graph.addForce(f.nodeId, Force(f.magnitude, f.angleRad));
    }

    for (const auto& s : supports_) {
        if (s.isJoint) {
            graph.addJoint(s.nodeId, s.theta);
        } else {
            graph.addScrolling(s.nodeId, s.theta);
        }
    }

    graph.balanceGraph();

    barResults_.clear();
    forceResults_.clear();

    const auto tensions = graph.getTensions();
    const auto external = graph.getExternalForces();

    for (const auto& bar : bars_) {
        const Node& nodeA = tensions.at(bar.from);
        const auto it = nodeA.neighbors.find(bar.to);

        if (it == nodeA.neighbors.end()) {
            throw std::runtime_error("Missing bar result for " + std::to_string(bar.from) + " - " + std::to_string(bar.to));
        }

        barResults_.push_back(BarResult{bar.from, bar.to, it->second.second});
    }

    for (const auto& [nodeId, forcesVec] : external) {
        const std::size_t originalCount = originalForceCountByNode_.count(nodeId)
            ? originalForceCountByNode_.at(nodeId)
            : 0;

        if (forcesVec.size() <= originalCount) {
            continue;
        }

        for (std::size_t i = originalCount; i < forcesVec.size(); ++i) {
            const Force& f = forcesVec[i];
            forceResults_.push_back(ForceResult{nodeId, f.measure, f.theta});
        }
    }

    solved_ = true;
}

std::vector<BarResult> TrussSolver::getBarResults() const {
    if (!solved_) {
        throw std::runtime_error("Solver has not run yet.");
    }
    return barResults_;
}

std::vector<ForceResult> TrussSolver::getForceResults() const {
    if (!solved_) {
        throw std::runtime_error("Solver has not run yet.");
    }
    return forceResults_;
}

std::string TrussSolver::resultsAsJson() const {
    if (!solved_) {
        throw std::runtime_error("Solver has not run yet.");
    }

    std::ostringstream out;
    out.setf(std::ios::fixed);
    out.precision(6);

    out << '[';

    bool first = true;

    for (const auto& b : barResults_) {
        if (!first) out << ',';
        first = false;
        out << '{'
            << "\"type\":\"bar\","
            << "\"from\":" << b.from << ','
            << "\"to\":" << b.to << ','
            << "\"value\":" << b.tension
            << '}';
    }

    for (const auto& r : forceResults_) {
        if (!first) out << ',';
        first = false;
        out << '{'
            << "\"type\":\"reaction\","
            << "\"from\":" << r.nodeId << ','
            << "\"to\":\"\","
            << "\"value\":" << r.magnitude << ','
            << "\"angleRad\":" << r.angleRad
            << '}';
    }

    out << ']';
    return out.str();
}