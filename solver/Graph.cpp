#include "Graph.hpp"
#include <map>
#include <iostream>
#include <iomanip>
#include <cmath>
#include <vector>
#include <queue>
#include <stdexcept>

const double EPS = 1e-9;

Graph::Graph() :
    nodes({}), supports({}), externalForces({}) {}

void Graph::addNode(const Node &n) {
    nodes[n.idx] = n;
}

void Graph::addBar(const int &idx1, const int &idx2) {
    nodes.at(idx1).addBar(nodes.at(idx2));
    nodes.at(idx2).addBar(nodes.at(idx1));
}

void Graph::addForce(const int &idx, const Force &f) {
    nodes.at(idx).addForce(f);
    externalForces[idx].push_back(f);
}

void Graph::addScrolling(const int &node_idx, const double &theta) {
    supports[node_idx] = Support({Force(INFINITY, theta + PI / 2)});
}

void Graph::addJoint(const int &node_idx, const double &theta) {
    supports[node_idx] = Support({Force(INFINITY, theta), Force(INFINITY, theta + PI / 2)});
}

bool Graph::checkIsostasis() const {
    const int numOfNodes = static_cast<int>(nodes.size());
    int realBars = 0;
    for (const auto& item : nodes) realBars += static_cast<int>(item.second.neighbors.size());
    realBars /= 2;
    int realSupportForces = 0;
    for (const auto& item : supports) {
        for (const Force& f : item.second.forces) {
            if (std::isinf(f.measure)) ++realSupportForces;
        }
    }
    return 2 * numOfNodes == realBars + realSupportForces;
}

void Graph::balanceSupports() {
    Force F1, F2, F3;
    int id1, id2, id3;
    int variables = 0;
    double SigmaFx = 0, SigmaFy = 0, SigmaTorque = 0;
    for (const auto & item : supports) {
        Support support = item.second;
        for (const Force & f : support.forces) {
            if (f.measure == INFINITY) {
                ++variables;
                if (variables == 1) {
                    id1 = item.first;
                    F1.theta = f.theta;
                }
                else if (variables == 2) {
                    id2 = item.first;
                    F2.theta = f.theta;
                }
                else {
                    id3 = item.first;
                    F3.theta = f.theta;
                }
            }
        }
        if (variables > 3) throw std::logic_error("Cannot work with hyperstatic graph :(");
    }
    if (!variables) return;
    for (const auto & item : externalForces) {
        for (const Force &f : item.second) {
            SigmaFx += f.measure * std::cos(f.theta);
            SigmaFy += f.measure * std::sin(f.theta);
            SigmaTorque += f.calcTorque(nodes[item.first], nodes.begin()->second);
        }
    }
    if (variables == 1) {
        if (std::abs(std::cos(F1.theta)) > 0.001)
            F1.measure = -SigmaFx / std::cos(F1.theta);
        else
            F1.measure = -SigmaFy / std::sin(F1.theta);
        addForce(id1, F1);            
    }
    else if (variables == 2) {
        double D, D1, D2;
        double x0 = nodes.begin()->second.x;
        double y0 = nodes.begin()->second.y;
        double a = (nodes[id1].x - x0) * sin(F1.theta) - (nodes[id1].y - y0) * cos(F1.theta);
        double b = (nodes[id2].x - x0) * sin(F2.theta) - (nodes[id2].y - y0) * cos(F2.theta);
        D = cos(F1.theta) * sin(F2.theta) - cos(F2.theta) * sin(F1.theta);
        if (std::abs(D) > 0.001) {
            D1 = -SigmaFx * sin(F2.theta) + SigmaFy * cos(F2.theta);
            D2 = - SigmaFy * cos(F1.theta) + sin(F1.theta) * SigmaFx;
        }
        else {
            D = cos(F1.theta) * b - cos(F2.theta) * a;
            if (std::abs(D) > 0.001) {
                D1 = - (SigmaFx * b - SigmaTorque * cos(F2.theta));
                D2 = - (cos(F1.theta) * SigmaTorque - a * SigmaFx);
            }
            else {
                D = sin(F1.theta) * b - sin(F2.theta) * a;
                D1 = - (SigmaFy * b - SigmaTorque * sin(F2.theta));
                D2 = - (sin(F1.theta) * SigmaTorque - a * SigmaFy);
            }
        }
        F1.measure = D1 / D;
        F2.measure = D2 / D;
        addForce(id1, F1);
        addForce(id2, F2);
    }
    else {
        double x0 = nodes.begin()->second.x;
        double y0 = nodes.begin()->second.y;
        double a = (nodes[id1].x - x0) * sin(F1.theta) - (nodes[id1].y - y0) * cos(F1.theta);
        double b = (nodes[id2].x - x0) * sin(F2.theta) - (nodes[id2].y - y0) * cos(F2.theta);
        double c = (nodes[id3].x - x0) * sin(F3.theta) - (nodes[id3].y - y0) * cos(F3.theta);
        double D = cos(F1.theta) * (sin(F2.theta) * c - sin(F3.theta) * b) 
                    - cos(F2.theta) * (sin(F1.theta) * c - sin(F3.theta) * a)
                    + cos(F3.theta) * (sin(F1.theta) * b - sin(F2.theta) * a);
        double D1 = -SigmaFx * (sin(F2.theta) * c - sin(F3.theta) * b)
                    + cos(F2.theta) * (SigmaFy * c - SigmaTorque * sin(F3.theta))
                    - cos(F3.theta) * (SigmaFy * b - SigmaTorque * sin(F2.theta));  
        double D2 = - cos(F1.theta) * (SigmaFy * c - SigmaTorque * sin(F3.theta))
                    + SigmaFx * (sin(F1.theta) * c - sin(F3.theta) * a)
                    - cos(F3.theta) * (sin(F1.theta) * SigmaTorque - a * SigmaFy);
        double D3 = - cos(F1.theta) * (sin(F2.theta) * SigmaTorque - b * SigmaFy)
                    + cos(F2.theta) * (sin(F1.theta) * SigmaTorque - a * SigmaFy)
                    - SigmaFx * (sin(F1.theta) * b - a * sin(F2.theta));
        // just in case
        if (std::abs(D) < EPS) {
            throw std::logic_error("Unstable support configuration: determinant is zero");
        }
        F1.measure = D1 / D;
        F2.measure = D2 / D;
        F3.measure = D3 / D;
        addForce(id1, F1);
        addForce(id2, F2);
        addForce(id3, F3);
    }
}

void Graph::balanceNode(Node &n) {
    double SigmaFx = 0, SigmaFy = 0;
    int unknown_tensions = 0;
    int idx_of_unknown1, idx_of_unknown2;
    for (const auto &item : n.neighbors) {
        int neighbor_idx = item.first;
        auto neighbor_data = item.second;
        double tension = neighbor_data.second;
        double angle = neighbor_data.first;
        if (tension == INFINITY) {
            ++unknown_tensions;
            // can't deal with more than 2 variables
            if (unknown_tensions > 2) throw std::runtime_error("more than 2 variables");
            if (unknown_tensions == 1) idx_of_unknown1 = neighbor_idx;
            else idx_of_unknown2 = neighbor_idx;
            continue;
        }
        SigmaFx += tension * cos(angle);
        SigmaFy += tension * sin(angle);
    }
    // external forces
    for (const Force &f : n.externalForces) {
        SigmaFx += f.measure * cos(f.theta);
        SigmaFy += f.measure * sin(f.theta);
    }
    if (unknown_tensions) {
        double theta1 = n.neighbors.at(idx_of_unknown1).first;
        if (unknown_tensions == 2) {
            // solve 2 x 2 linear system using determinants
            double theta2 = n.neighbors.at(idx_of_unknown2).first;
            double D1 = (-SigmaFx * sin(theta2) + SigmaFy * cos(theta2));
            double D2 = (-SigmaFy * cos(theta1) + SigmaFx * sin(theta1));
            double D = (cos(theta1) * sin(theta2) - sin(theta1) * cos(theta2));
            if (std::abs(D) < EPS) {
                throw std::logic_error("Cannot solve node: member directions are dependent");
            }
            n.neighbors.at(idx_of_unknown1).second = D1 / D;
            nodes.at(idx_of_unknown1).neighbors[n.idx].second = D1 / D;
            n.neighbors.at(idx_of_unknown2).second = D2 / D;
            nodes.at(idx_of_unknown2).neighbors[n.idx].second = D2 / D;
        }
        else {
            // linear equation
            if (std::abs(std::cos(theta1)) > 0.001)
                n.neighbors.at(idx_of_unknown1).second = -SigmaFx / std::cos(theta1);
            else
                n.neighbors.at(idx_of_unknown1).second = -SigmaFy / std::sin(theta1);
            nodes.at(idx_of_unknown1).neighbors[n.idx].second = n.neighbors.at(idx_of_unknown1).second;
        }
    }
}

void Graph::balanceGraph() {
    if (!checkIsostasis()) throw std::logic_error("The graph isn't isostatic");
    balanceSupports();
    std::queue<int> q;
    for (const auto &item : nodes) {
        q.push(item.first);
    }
    int failedInARow = 0;
    const int maxFailedInARow = static_cast<int>(nodes.size());
    while (!q.empty()) {
        int cur = q.front();
        q.pop();
        try {
            balanceNode(nodes.at(cur));
            failedInARow = 0;
        }
        catch (const std::runtime_error &e) {
            q.push(cur);
            ++failedInARow;
            if (failedInARow >= maxFailedInARow) {
                throw std::logic_error("Cannot solve graph: no joint with at most two unknown member forces");
            }
        }
    }
}

void Graph::printTensions() const {
    std::map<int, Node> sorted_copy;
    for (const auto &item : nodes) {
        sorted_copy[item.first] = nodes.at(item.first);
    }
    for (const auto &item : sorted_copy) {
        std::cout << item.first << ": \n";
        for (const auto & neighbor : item.second.neighbors) {
            std::cout << "  - " << neighbor.first << " : " << std::fixed << std::setprecision(3);
            if (std::abs(neighbor.second.second) > 0.001) std::cout << neighbor.second.second << '\n';
            else std::cout << 0 << '\n';
        }
    }
}

void Graph::printExternalForces() const {
    std::map<int, std::vector<Force>> sorted_copy;
    for (const auto &item : externalForces) {
        sorted_copy[item.first] = item.second;
    }
    for (const auto &item : sorted_copy) {
        std::cout << item.first << ": \n";
        int i = 1;
        for (const Force &f : item.second) {
            std::cout << " - F" << i++ << " = ";
            f.print();
        }
    }
}

std::map<int, Node> Graph::getTensions() const {
    std::map<int, Node> sorted_copy;
    for (const auto &item : nodes) {
        sorted_copy[item.first] = nodes.at(item.first);
    }
    return sorted_copy;
}

std::map<int, std::vector<Force>> Graph::getExternalForces() const {
    std::map<int, std::vector<Force>> sorted_copy;
    for (const auto &item : externalForces) {
        sorted_copy[item.first] = item.second;
    }
    return sorted_copy;
}

