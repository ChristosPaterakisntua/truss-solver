#include "Force.hpp"
#include <iomanip>
#include <cmath>
#include <iostream>

Force::Force(const double &Measure, const double &Theta) :
    measure(Measure), theta(Theta) {}

double Force::calcTorque(const Point &p1, const Point &p2) const { // p1: where the force acts, p2: point for torque 
    return (p1.x - p2.x) * measure * sin(theta) - (p1.y - p2.y) * measure * cos(theta);
}
void Force::print() const {
    if (std::abs(measure) > 0.001) {
        std::cout << std::fixed << std::setprecision(3) << measure << " with " << theta * 180 / PI << " degrees angle with x axis\n";
    }
    else std::cout << 0 << '\n';
}