#pragma once

#include "Node.hpp"
#include <map>

struct Support { 
    std::vector<Force> forces;
    double torque;
    Support(const std::vector<Force> &Forces = {}, const double &Torque = 0): 
        forces(Forces), torque(Torque) {}
};

class Graph {
private:
    std::unordered_map<int, Node> nodes;
    std::unordered_map<int, Support> supports;
    std::unordered_map<int, std::vector<Force>> externalForces;

public:
    Graph();
    
    void addNode(const Node &n);

    void addBar(const int &idx1, const int &idx2);

    void addForce(const int &idx, const Force &f);

    void addScrolling(const int &node_idx, const double &theta = 0);

    void addJoint(const int &node_idx, const double &theta = 0);

    bool checkIsostasis() const;

    void balanceSupports();

    void balanceNode(Node &n);

    void balanceGraph();

    void printTensions() const;

    void printExternalForces() const;

    std::map<int, Node> getTensions() const;

    std::map<int, std::vector<Force>> getExternalForces() const;
};