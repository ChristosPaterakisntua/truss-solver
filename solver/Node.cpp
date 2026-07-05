#include "Node.hpp"
#include <cmath>
#include <utility>

Node::Node(int Idx, const double &X, const double &Y) :
    Point(Idx, X, Y), neighbors({}) {}

void Node::addBar(const Node &n) {
    double angle = std::atan2(n.y - y, n.x - x);
    neighbors[n.idx] = std::make_pair(angle, INFINITY);
}

void Node::addForce(const Force &f) {
    externalForces.push_back(f);
}