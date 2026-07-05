#include "Point.hpp"
#include <cmath>

Point::Point(int Idx, const double &X, const double &Y) :
    idx(Idx), x(X), y(Y) {}

void Point::setCartesian(const double &X, const double &Y) {
    x = X;
    y = Y;
}

double distance(const Point& p1, const Point &p2) {
    return sqrt(pow(p1.x - p2.x, 2) + pow(p1.y-p2.y, 2));
}