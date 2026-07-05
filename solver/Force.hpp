#pragma once

#include "Point.hpp"
#include <cmath>

const double PI = std::acos(-1.0);


class Force {
private:
    double measure, theta; // theta = the angle in radians between f vector and x axis
public:
    Force(const double &Measure = 0, const double &Theta = 0);

    double calcTorque(const Point &p1, const Point &p2) const;
    void print() const;

    friend class Graph;
    friend class TrussSolver;
};