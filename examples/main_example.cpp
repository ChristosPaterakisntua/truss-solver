#include "Graph.hpp"

int main() {
    Graph myGraph;
    myGraph.addNode(Node(1,0,0));
    myGraph.addNode(Node(2,2,0));
    myGraph.addNode(Node(3,4,0));
    myGraph.addNode(Node(4,6,0));
    myGraph.addNode(Node(5,0,1));
    myGraph.addNode(Node(6,2,1));
    myGraph.addNode(Node(7,4,1));
    myGraph.addNode(Node(8,6,1));
    myGraph.addBar(1,2);
    myGraph.addBar(2,3);
    myGraph.addBar(3,4);
    myGraph.addBar(1,5);
    myGraph.addBar(2,6);
    myGraph.addBar(3,7);
    myGraph.addBar(4,8);
    myGraph.addBar(5,6);
    myGraph.addBar(6,7);
    myGraph.addBar(7,8);
    myGraph.addBar(5,2);
    myGraph.addBar(7,2);
    myGraph.addBar(7,4);
    myGraph.addScrolling(1, 0); // equivalent with myGraph.addForce(1, Force(0.33, PI/2));
    myGraph.addJoint(4, 0); // equivalent with myGraph.addForce(4, Force(0.67, PI/2));
    myGraph.addForce(7, Force(1.0, 3*PI/2));
    myGraph.balanceGraph();
    myGraph.printTensions();
    myGraph.printExternalForces();
    return 0;
}
