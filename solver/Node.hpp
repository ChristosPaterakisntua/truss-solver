#pragma once

#include "Force.hpp"
#include <unordered_map>
#include <utility>
#include <vector>

class Node : public Point {
private:
    std::unordered_map<int, std::pair<double, double>> neighbors; // <node_idx, <angle_to_node, tension>>
    std::vector<Force> externalForces;
public:
    Node(int Idx = 0, const double &X = 0, const double &Y = 0);
    
    void addBar(const Node &n);

    void addForce(const Force &f) ;
    friend class Graph;
    friend class TrussSolver;
};