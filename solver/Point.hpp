#pragma once

class Point {
private:
    int idx;
    double x, y;
public:
    Point(int Idx = 0, const double &X = 0, const double &Y = 0);
    void setCartesian(const double &X, const double &Y);
    friend double distance(const Point& p1, const Point &p2);
    friend class Node;
    friend class Graph;
    friend class Force;
};