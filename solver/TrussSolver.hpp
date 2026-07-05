#pragma once

#include "Graph.hpp"

#include <cstddef>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

struct TrussNodeInput {
    int id{};
    double x{};
    double y{};
};

struct TrussBarInput {
    int from{};
    int to{};
};

struct TrussForceInput {
    int nodeId{};
    double magnitude{};
    double angleRad{};
};

struct TrussSupportInput {
    int nodeId{};
    bool isJoint{};
    double theta{};
};

struct BarResult {
    int from{};
    int to{};
    double tension{};
};

struct ForceResult {
    int nodeId{};
    double magnitude{};
    double angleRad{};
};

class TrussSolver {
private:
    std::vector<TrussNodeInput> nodes_;
    std::vector<TrussBarInput> bars_;
    std::vector<TrussForceInput> forces_;
    std::vector<TrussSupportInput> supports_;

    std::unordered_set<int> nodeIds_;
    std::unordered_map<int, std::size_t> originalForceCountByNode_;

    std::vector<BarResult> barResults_;
    std::vector<ForceResult> forceResults_;

    bool solved_ = false;

    void ensureNodeExists(int id) const;
    void upsertSupport(int nodeId, bool isJoint, double theta);
    bool barExists(int a, int b) const;

public:
    TrussSolver() = default;

    void clear();

    void addNode(int id, double x, double y);
    void addBar(int a, int b);
    void addForce(int nodeId, double magnitude, double angleRad);
    void addScrolling(int nodeId, double theta = 0);
    void addJoint(int nodeId, double theta = 0);

    void solve();

    std::vector<BarResult> getBarResults() const;
    std::vector<ForceResult> getForceResults() const;

    std::string resultsAsJson() const;
};