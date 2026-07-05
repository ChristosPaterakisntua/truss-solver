/*
  Truss solver frontend (vanilla JS)
  -----------------------------------
  Expected HTML IDs:

  Buttons / controls:
    - btn-add-node
    - btn-add-bar
    - btn-add-force
    - btn-add-support
    - btn-solve
    - btn-clear
    - btn-pan
    - btn-zoom-in
    - btn-zoom-out
    - btn-reset-view

  Inputs for force/support:
    - input-force-node-id
    - input-force-magnitude
    - input-force-angle-deg
    - input-support-node-id
    - select-support-type   // "roller" | "pin"
    - input-support-angle-deg

  Optional results:
    - results-table-body     // <tbody>
    - status-bar             // status text element
    - canvas-wrap            // container for the SVG
    - truss-svg              // <svg>

  This file is framework-agnostic and can work with a simple HTML page.
  It renders nodes, bars, forces, supports, and prepares data for a Wasm solver.
*/

(() => {
  'use strict';

  // ---------- Configuration ----------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NODE_RADIUS = 7;
  const GRID_STEP = 25;
  const SNAP_DISTANCE = 10;

  const Mode = Object.freeze({
    NAVIGATE: 'navigate',
    ADD_NODE: 'add_node',
    ADD_BAR: 'add_bar'
  });

  const SupportType = Object.freeze({
    ROLLER: 'roller',
    PIN: 'pin',
  });

  // ---------- App state ----------
  const state = {
    mode: Mode.NAVIGATE,
    viewBox: { x: 0, y: 0, w: 1200, h: 800 },
    nextNodeId: 1,
    nodes: [],        // { id, x, y }
    bars: [],         // { id, from, to }
    forces: [],       // { id, nodeId, magnitude, angleDeg }
    supports: [],     // { nodeId, type, angleDeg }
    history: [],
    selectedBarStart: null,
    isPanning: false,
    panStart: null,
    wasmReady: false,
    wasmModule: null,
  };

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);

  const el = {
    svg: null,
    status: null,
    resultsBody: null,

    btnAddNode: null,
    btnAddBar: null,
    btnSolve: null,
    btnClear: null,
    btnPan: null,
    btnUndo: null,
    btnZoomIn: null,
    btnZoomOut: null,
    btnResetView: null,

    inputForceNodeId: null,
    inputForceMagnitude: null,
    inputForceAngleDeg: null,

    inputSupportNodeId: null,
    selectSupportType: null,
    inputSupportAngleDeg: null,
  };

  function cacheDom() {
    el.svg = $('truss-svg');
    el.status = $('status-bar');
    el.resultsBody = $('results-table-body');

    el.btnAddNode = $('btn-add-node');
    el.btnAddBar = $('btn-add-bar');
    el.btnSolve = $('btn-solve');
    el.btnUndo = $('btn-undo');
    el.btnClear = $('btn-clear');
    el.btnPan = $('btn-pan');
    el.btnZoomIn = $('btn-zoom-in');
    el.btnZoomOut = $('btn-zoom-out');
    el.btnResetView = $('btn-reset-view');

    el.inputForceNodeId = $('input-force-node-id');
    el.inputForceMagnitude = $('input-force-magnitude');
    el.inputForceAngleDeg = $('input-force-angle-deg');

    el.inputSupportNodeId = $('input-support-node-id');
    el.selectSupportType = $('select-support-type');
    el.inputSupportAngleDeg = $('input-support-angle-deg');

    if (!el.svg) {
      throw new Error('Missing #truss-svg in HTML');
    }
  }

  function setStatus(message, kind = 'info') {
    if (!el.status) return;
    el.status.textContent = message;
    el.status.dataset.kind = kind;
  }

  function setMode(mode) {
    state.mode = mode;
    state.selectedBarStart = null;

    const buttons = [
      [el.btnAddNode, Mode.ADD_NODE],
      [el.btnAddBar, Mode.ADD_BAR],
      [el.btnPan, Mode.NAVIGATE],
    ];

    buttons.forEach(([button, buttonMode]) => {
      if (!button) return;
      button.classList.toggle('active', mode === buttonMode);
    });

    if (mode === Mode.ADD_NODE) setStatus('Node mode: click on the canvas to add a node.');
    else if (mode === Mode.ADD_BAR) setStatus('Bar mode: click two nodes to connect them.');
    else if (mode === Mode.ADD_FORCE) setStatus('Force mode: enter force values, then apply to a node.');
    else if (mode === Mode.ADD_SUPPORT) setStatus('Support mode: enter support values, then apply to a node.');
    else setStatus('Navigate mode: drag to pan, use zoom controls if available.');
  }

  // ---------- Coordinate transforms ----------
  function parseViewBox() {
    const vb = el.svg.viewBox.baseVal;
    state.viewBox = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
  }

  function clientToSvgPoint(clientX, clientY) {
    const pt = el.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = el.svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const sp = pt.matrixTransform(ctm.inverse());
    return { x: sp.x, y: sp.y };
  }

  function snapPoint(point) {
    const nearest = findNearestNode(point.x, point.y, SNAP_DISTANCE);
    if (nearest) return { x: nearest.x, y: nearest.y, snappedToNodeId: nearest.id };
    return { x: point.x, y: point.y, snappedToNodeId: null };
  }

  function findNearestNode(x, y, maxDist = 12) {
    let best = null;
    let bestD = Infinity;
    for (const node of state.nodes) {
      const dx = node.x - x;
      const dy = node.y - y;
      const d = Math.hypot(dx, dy);
      if (d < bestD && d <= maxDist) {
        best = node;
        bestD = d;
      }
    }
    return best;
  }

  function getNodeById(id) {
    return state.nodes.find((n) => n.id === Number(id)) || null;
  }

  // ---------- Data management ----------
  function addNode(x, y) {
    const node = { id: state.nextNodeId++, x, y };
    pushHistory('Add Node');
    state.nodes.push(node);
    render();
    setStatus(`Node ${node.id} added at (${x.toFixed(1)}, ${y.toFixed(1)}).`);
    return node;
  }

  function addBar(fromId, toId) {
    const from = Number(fromId);
    const to = Number(toId);

    if (from === to) {
      setStatus('A bar needs two different nodes.', 'error');
      return null;
    }

    const a = getNodeById(from);
    const b = getNodeById(to);
    if (!a || !b) {
      setStatus('Cannot create bar: one or both nodes do not exist.', 'error');
      return null;
    }

    const alreadyExists = state.bars.some(
      (bar) => (bar.from === from && bar.to === to) || (bar.from === to && bar.to === from)
    );
    if (alreadyExists) {
      setStatus('That bar already exists.', 'error');
      return null;
    }

    const bar = { id: state.bars.length + 1, from, to };
    pushHistory('Add Bar');
    state.bars.push(bar);
    render();
    setStatus(`Bar added between node ${from} and node ${to}.`);
    return bar;
  }

  function addForce(nodeId, magnitude, angleDeg) {
    const id = Number(nodeId);
    const node = getNodeById(id);
    if (!node) {
      setStatus('Force target node does not exist.', 'error');
      return null;
    }

    const force = {
      id: state.forces.length + 1,
      nodeId: id,
      magnitude: Number(magnitude),
      angleDeg: Number(angleDeg),
    };
    pushHistory('Add Force');
    state.forces.push(force);
    render();
    setStatus(`Force added to node ${id}.`);
    return force;
  }

  function addSupport(nodeId, type, angleDeg) {
    const id = Number(nodeId);
    const node = getNodeById(id);
    if (!node) {
      setStatus('Support target node does not exist.', 'error');
      return null;
    }

    const support = {
      nodeId: id,
      type,
      angleDeg: Number(angleDeg),
    };

    pushHistory('Add Support');
    const existingIndex = state.supports.findIndex((s) => s.nodeId === id);
    if (existingIndex >= 0) state.supports[existingIndex] = support;
    else state.supports.push(support);

    render();
    setStatus(`Support added on node ${id}.`);
    return support;
  }

  function clearAll() {
    state.nextNodeId = 1;
    state.nodes = [];
    state.bars = [];
    state.forces = [];
    state.supports = [];
    state.history = [];
    updateUndoButton();
    state.selectedBarStart = null;
    render();
    clearResults();
    setStatus('Canvas cleared.');
  }

  // ---------- SVG rendering ----------
  function createSvgEl(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    return node;
  }

  function clearSvg() {
    while (el.svg.firstChild) el.svg.removeChild(el.svg.firstChild);
  }

  function drawGrid() {
    const { x, y, w, h } = state.viewBox;
    const grid = createSvgEl('g', { id: 'grid-layer' });

    const startX = Math.floor(x / GRID_STEP) * GRID_STEP;
    const endX = x + w;
    const startY = Math.floor(y / GRID_STEP) * GRID_STEP;
    const endY = y + h;

    for (let gx = startX; gx <= endX; gx += GRID_STEP) {
      grid.appendChild(createSvgEl('line', {
        x1: gx, y1: startY, x2: gx, y2: endY,
        class: 'grid-line'
      }));
    }

    for (let gy = startY; gy <= endY; gy += GRID_STEP) {
      grid.appendChild(createSvgEl('line', {
        x1: startX, y1: gy, x2: endX, y2: gy,
        class: 'grid-line'
      }));
    }

    el.svg.appendChild(grid);
  }

  function drawBars() {
    const g = createSvgEl('g', { id: 'bars-layer' });
    for (const bar of state.bars) {
      const a = getNodeById(bar.from);
      const b = getNodeById(bar.to);
      if (!a || !b) continue;

      g.appendChild(createSvgEl('line', {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        class: 'bar-line'
      }));
    }
    el.svg.appendChild(g);
  }

  function ensureArrowMarker() {
    let defs = el.svg.querySelector('defs');

    if (!defs) {
      defs = createSvgEl('defs');
      el.svg.prepend(defs);
    }

    if (defs.querySelector('#arrowhead')) return;

    const marker = createSvgEl('marker', {
      id: 'arrowhead',
      markerWidth: 18,
      markerHeight: 18,
      refX: 16,
      refY: 9,
      orient: 'auto',
      markerUnits: 'userSpaceOnUse',
    });

    const path = createSvgEl('path', {
      d: 'M 0 0 L 18 9 L 0 18 z',
      fill: '#fbbf24',
    });

    marker.appendChild(path);
    defs.appendChild(marker);
  }

  function drawForces() {
    const g = createSvgEl('g', { id: 'forces-layer' });
    for (const force of state.forces) {
      const node = getNodeById(force.nodeId);
      if (!node) continue;

      const angleRad = (force.angleDeg * Math.PI) / 180;
      const len = Math.max(35, Math.min(90, Math.abs(force.magnitude) * 20));
      const dx = Math.cos(angleRad) * len;
      const dy = - Math.sin(angleRad) * len;
      const x1 = node.x - dx;
      const y1 = node.y - dy;
      const x2 = node.x;
      const y2 = node.y;

      g.appendChild(createSvgEl('line', {
        x1,
        y1,
        x2,
        y2,
        class: 'force-arrow',
        'marker-end': 'url(#arrowhead)'
      }));

      const label = createSvgEl('text', {
        x: x1 + 6,
        y: y1 - 6,
        class: 'force-label'
      });
      label.textContent = `F${force.id}`;
      g.appendChild(label);
    }
    el.svg.appendChild(g);
  }

  function drawSupports() {
    const g = createSvgEl('g', { id: 'supports-layer' });
    for (const support of state.supports) {
      const node = getNodeById(support.nodeId);
      if (!node) continue;

      const size = 18;
      const baseY = node.y + NODE_RADIUS + 10;

      if (support.type === SupportType.ROLLER) {
        // simple roller symbol
        g.appendChild(createSvgEl('circle', {
          cx: node.x - 7,
          cy: baseY,
          r: 4,
          class: 'support-symbol'
        }));
        g.appendChild(createSvgEl('circle', {
          cx: node.x + 7,
          cy: baseY,
          r: 4,
          class: 'support-symbol'
        }));
        g.appendChild(createSvgEl('line', {
          x1: node.x - 12, y1: baseY + 8,
          x2: node.x + 12, y2: baseY + 8,
          class: 'support-symbol'
        }));
      } else {
        // pin symbol
        g.appendChild(createSvgEl('polygon', {
          points: `${node.x},${baseY} ${node.x - size},${baseY + size} ${node.x + size},${baseY + size}`,
          class: 'support-symbol'
        }));
      }

      const label = createSvgEl('text', {
        x: node.x + 10,
        y: baseY + 28,
        class: 'support-label'
      });
      label.textContent = support.type;
      g.appendChild(label);
    }
    el.svg.appendChild(g);
  }

  function drawNodes() {
    const g = createSvgEl('g', { id: 'nodes-layer' });
    for (const node of state.nodes) {
      g.appendChild(createSvgEl('circle', {
        cx: node.x,
        cy: node.y,
        r: NODE_RADIUS,
        class: 'node-circle',
        'data-node-id': node.id
      }));

      const label = createSvgEl('text', {
        x: node.x + 10,
        y: node.y - 10,
        class: 'node-label'
      });
      label.textContent = String(node.id);
      g.appendChild(label);
    }
    el.svg.appendChild(g);
  }

  function render() {
    parseViewBox();
    clearSvg();
    ensureArrowMarker();
    drawGrid();
    drawBars();
    drawForces();
    drawSupports();
    drawNodes();
    updateResultsPlaceholder();
  }

  // ---------- Results ----------
  function clearResults() {
    if (!el.resultsBody) return;
    el.resultsBody.innerHTML = '';
  }

  function updateResultsPlaceholder() {
    if (!el.resultsBody) return;
    if (!state.wasmReady) return;
  }

  function showResults(results) {
    if (!el.resultsBody) return;
    el.resultsBody.innerHTML = '';

    for (const row of results) {
      const tr = document.createElement('tr');

      const cells = [
        row.type ?? '',
        row.from ?? '',
        row.to ?? '',
        row.value ?? '',
      ];

      for (const value of cells) {
        const td = document.createElement('td');
        td.textContent = String(value);
        tr.appendChild(td);
      }

      el.resultsBody.appendChild(tr);
    }
  }

  function showSolverError(message) {
    showResults([
      {
        type: 'error',
        from: '-',
        to: '-',
        value: message,
      },
    ]);
  }

  function formatSolverError(err) {
    const raw = err?.message ? err.message : String(err);

    if (raw.includes("isn't isostatic")) {
      return 'The carrier is not isostatic. For a flat lattice we must have m + r = 2j';
    }

    if (raw.includes('hyperstatic')) {
      return 'The vector is hyperstatic and cannot be solved by this solver.';
    }

    if (raw.includes('determinant is zero')) {
      return 'The arrangement of supports or members is unstable: the determinant is zero.';
    }

    if (raw.includes('member directions are dependent')) {
      return 'No node is solved: the unknown rods have dependent or parallel directions.';
    }

    if (raw.includes('no joint with at most two unknown')) {
      return 'The vector cannot be solved by the node method as it stands now. There is no node available with up to two unknown members.';
    }

    return `Could not be resolved: ${raw}`;
  }

  function countSupportReactions() {
    return state.supports.reduce((sum, support) => {
      if (support.type === SupportType.PIN) return sum + 2;
      if (support.type === SupportType.ROLLER) return sum + 1;
      return sum;
    }, 0);
  }

  function validateModelBeforeSolve() {
    const j = state.nodes.length;
    const m = state.bars.length;
    const r = countSupportReactions();

    if (j === 0) {
      return 'There are no nodes.';
    }

    if (m === 0) {
      return 'There are no bars.';
    }

    for (const force of state.forces) {
      if (!Number.isFinite(force.magnitude) || !Number.isFinite(force.angleDeg)) {
        return `There is invalid power at the node. ${force.nodeId}.`;
      }
    }

    for (const support of state.supports) {
      if (!Number.isFinite(support.angleDeg)) {
        return `There is an invalid support angle at the node. ${support.nodeId}.`;
      }
    }

    const left = m + r;
    const right = 2 * j;

    if (left !== right) {
      if (left < right) {
        return `The carrier is not isostatic or is inadequately supported: m + r = ${left}, while 2j = ${right}. Missing ${right - left} unknown bars/reactions.`;
      }

      return `The vector is hyperstatic for this solver: m + r = ${left}, while 2j = ${right}. ${left - right} leftover unkown.`;
    }

    return null;
  }

  // ---------- Convert to solver payload ----------
  function buildSolverPayload() {
    return {
      nodes: state.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
      bars: state.bars.map((b) => ({ from: b.from, to: b.to })),
      forces: state.forces.map((f) => ({
        nodeId: f.nodeId,
        magnitude: f.magnitude,
        angleDeg: f.angleDeg,
      })),
      supports: state.supports.map((s) => ({
        nodeId: s.nodeId,
        type: s.type,
        angleDeg: s.angleDeg,
      })),
    };
  }

  async function solve() {
    if (!state.wasmReady || !state.wasmModule) {
      const message = 'Wasm solver not ready yet.';
      setStatus(message, 'warn');
      showSolverError('Wait for the WASM solver to load.');
      return;
    }

    const validationError = validateModelBeforeSolve();
    if (validationError) {
      setStatus(validationError, 'error');
      showSolverError(validationError);
      return;
    }

    let solver = null;

    try {
      solver = new state.wasmModule.TrussSolver();
      solver.clear();

      for (const n of state.nodes) {
        solver.addNode(n.id, n.x, n.y);
      }

      for (const b of state.bars) {
        solver.addBar(b.from, b.to);
      }

      for (const f of state.forces) {
        solver.addForce(
          f.nodeId,
          f.magnitude,
          (f.angleDeg * Math.PI) / 180.0
        );
      }

      for (const s of state.supports) {
        if (s.type === SupportType.PIN) {
          solver.addJoint(s.nodeId, (s.angleDeg * Math.PI) / 180.0);
        } else {
          solver.addScrolling(s.nodeId, (s.angleDeg * Math.PI) / 180.0);
        }
      }

      solver.solve();

      const results = JSON.parse(solver.resultsAsJson());

      showResults(results);
      setStatus('Solved successfully.', 'success');
    } catch (err) {
      console.error(err);

      const message = formatSolverError(err);
      setStatus(message, 'error');
      showSolverError(message);
    } finally {
      if (solver && typeof solver.delete === 'function') {
        solver.delete();
      }
    }
  }

  // ---------- Event handlers ----------
  function handleSvgClick(event) {
    const pt = clientToSvgPoint(event.clientX, event.clientY);
    const snapped = snapPoint(pt);

    if (state.mode === Mode.ADD_NODE && event.button === 0) {
      addNode(snapped.x, snapped.y);
      return;
    }

    if (state.mode === Mode.ADD_BAR && event.button === 0) {
      const clickedNode = findNearestNode(pt.x, pt.y, SNAP_DISTANCE);
      if (!clickedNode) {
        setStatus('Click near a node to create a bar.', 'warn');
        return;
      }

      if (!state.selectedBarStart) {
        state.selectedBarStart = clickedNode.id;
        setStatus(`Bar start selected: node ${clickedNode.id}. Click a second node.`);
        render();
        highlightSelectedNode(clickedNode.id);
        return;
      }

      const start = state.selectedBarStart;
      const end = clickedNode.id;
      state.selectedBarStart = null;
      addBar(start, end);
      render();
      return;
    }
  }

  function highlightSelectedNode(nodeId) {
    const circle = el.svg.querySelector(`[data-node-id="${nodeId}"]`);
    if (circle) circle.classList.add('selected-node');
  }

  function handlePointerDown(event) {
    if (state.mode !== Mode.NAVIGATE || event.button !== 0) return;
    state.isPanning = true;
    state.panStart = { x: event.clientX, y: event.clientY, vb: { ...state.viewBox } };
    el.svg.style.cursor = 'grabbing';
  }

  function handlePointerMove(event) {
    if (!state.isPanning || !state.panStart) return;
    const dx = event.clientX - state.panStart.x;
    const dy = event.clientY - state.panStart.y;

    const scaleX = state.panStart.vb.w / el.svg.clientWidth;
    const scaleY = state.panStart.vb.h / el.svg.clientHeight;

    const nextX = state.panStart.vb.x - dx * scaleX;
    const nextY = state.panStart.vb.y - dy * scaleY;

    el.svg.viewBox.baseVal.x = nextX;
    el.svg.viewBox.baseVal.y = nextY;
    parseViewBox();
    render();
  }

  function handlePointerUp() {
    state.isPanning = false;
    state.panStart = null;
    el.svg.style.cursor = '';
  }

  function handleWheel(event) {
    if (state.mode !== Mode.NAVIGATE) return;
    event.preventDefault();

    const zoomFactor = event.deltaY < 0 ? 0.9 : 1.1;
    const vb = el.svg.viewBox.baseVal;
    const mx = event.offsetX / el.svg.clientWidth;
    const my = event.offsetY / el.svg.clientHeight;

    const newW = vb.width * zoomFactor;
    const newH = vb.height * zoomFactor;

    const newX = vb.x + (vb.width - newW) * mx;
    const newY = vb.y + (vb.height - newH) * my;

    vb.x = newX;
    vb.y = newY;
    vb.width = newW;
    vb.height = newH;
    parseViewBox();
    render();
  }

  function updateViewBox(reset = false) {
    const vb = el.svg.viewBox.baseVal;
    if (reset) {
      vb.x = 0;
      vb.y = 0;
      vb.width = 1200;
      vb.height = 800;
    }
    parseViewBox();
    render();
  }

  function cloneModelState() {
    return {
      nodes: state.nodes.map((n) => ({ ...n })),
      bars: state.bars.map((b) => ({ ...b })),
      forces: state.forces.map((f) => ({ ...f })),
      supports: state.supports.map((s) => ({ ...s })),

      // If you have nextNodeId, we keep it.
      nextNodeId: state.nextNodeId,

      // If you have a temporary option for add bar, we keep/clear it.
      selectedBarNodeId: state.selectedBarNodeId,
      pendingBarNodeId: state.pendingBarNodeId,
    };
  }

  function restoreModelState(snapshot) {
    state.nodes = snapshot.nodes.map((n) => ({ ...n }));
    state.bars = snapshot.bars.map((b) => ({ ...b }));
    state.forces = snapshot.forces.map((f) => ({ ...f }));
    state.supports = snapshot.supports.map((s) => ({ ...s }));

    if ('nextNodeId' in state) {
      state.nextNodeId = snapshot.nextNodeId;
    }

    if ('selectedBarNodeId' in state) {
      state.selectedBarNodeId = null;
    }

    if ('pendingBarNodeId' in state) {
      state.pendingBarNodeId = null;
    }
  }

  function pushHistory(actionName) {
    state.history.push({
      actionName,
      snapshot: cloneModelState(),
    });

    // To stop history from growing infinitely.
    if (state.history.length > 100) {
      state.history.shift();
    }

    updateUndoButton();
  }

  function undoLastAction() {
    if (state.history.length === 0) {
      setStatus('There is nothing to undo.', 'warn');
      return;
    }

    const last = state.history.pop();

    restoreModelState(last.snapshot);

// Clear old results, because the model has now changed.
  showResults([
      {
        type: 'info',
        from: '-',
        to: '-',
        value: 'The results were cleared after the revocation.',
      },
    ]);

    updateUndoButton();
    render();

    setStatus(`Undo: ${last.actionName}`, 'success');
  }

  function updateUndoButton() {
    if (!el.btnUndo) return;

    el.btnUndo.disabled = state.history.length === 0;
    el.btnUndo.textContent =
      state.history.length === 0 ? 'Undo' : `Undo (${state.history.length})`;
  }

  function wireUi() {
    el.btnAddNode?.addEventListener('click', () => setMode(Mode.ADD_NODE));
    el.btnAddBar?.addEventListener('click', () => setMode(Mode.ADD_BAR));
    el.btnPan?.addEventListener('click', () => setMode(Mode.NAVIGATE));
    el.btnClear?.addEventListener('click', clearAll);
    el.btnSolve?.addEventListener('click', solve);
    el.btnResetView?.addEventListener('click', () => updateViewBox(true));
    el.btnUndo?.addEventListener('click', undoLastAction);
    updateUndoButton();

    el.btnZoomIn?.addEventListener('click', () => {
      const vb = el.svg.viewBox.baseVal;
      vb.x += vb.width * 0.1;
      vb.y += vb.height * 0.1;
      vb.width *= 0.8;
      vb.height *= 0.8;
      parseViewBox();
      render();
    });

    el.btnZoomOut?.addEventListener('click', () => {
      const vb = el.svg.viewBox.baseVal;
      vb.x -= vb.width * 0.125;
      vb.y -= vb.height * 0.125;
      vb.width *= 1.25;
      vb.height *= 1.25;
      parseViewBox();
      render();
    });

    el.svg.addEventListener('click', handleSvgClick);
    el.svg.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    el.svg.addEventListener('wheel', handleWheel, { passive: false });

    // Force form shortcut: enter -> add force
    const forceSubmit = async () => {
      if (!el.inputForceNodeId || !el.inputForceMagnitude || !el.inputForceAngleDeg) return;
      addForce(
        el.inputForceNodeId.value,
        el.inputForceMagnitude.value,
        el.inputForceAngleDeg.value
      );
    };

    const supportSubmit = async () => {
      if (!el.inputSupportNodeId || !el.selectSupportType || !el.inputSupportAngleDeg) return;
      addSupport(
        el.inputSupportNodeId.value,
        el.selectSupportType.value,
        el.inputSupportAngleDeg.value
      );
    };

    el.inputForceMagnitude?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') forceSubmit();
    });
    el.inputForceAngleDeg?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') forceSubmit();
    });
    el.inputForceNodeId?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') forceSubmit();
    });

    el.inputSupportNodeId?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') supportSubmit();
    });
    el.inputSupportAngleDeg?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') supportSubmit();
    });
  }

  // ---------- Wasm hookup ----------
  function attachWasmModule(Module) {
    state.wasmModule = Module;
    state.wasmReady = true;
    setStatus('Wasm solver loaded and ready.', 'success');
  }

  function waitForModuleAndAttach() {
    window.Module = window.Module || {};

    if (window.Module.TrussSolver) {
      attachWasmModule(window.Module);
      return;
    }

    const previous = window.Module.onRuntimeInitialized;
    window.Module.onRuntimeInitialized = () => {
      if (typeof previous === 'function') {
        previous();
      }
      attachWasmModule(window.Module);
    };
  }

  // ---------- Public API ----------
  window.TrussApp = {
    state,
    setMode,
    addNode,
    addBar,
    addForce,
    addSupport,
    clearAll,
    render,
    solve,
    attachWasmModule,
    buildSolverPayload,
  };

  // ---------- Init ----------
  function init() {
    cacheDom();

    // Default SVG viewBox if not set in HTML.
    if (!el.svg.getAttribute('viewBox')) {
      el.svg.setAttribute('viewBox', '0 0 1200 800');
    }
    if (!el.svg.getAttribute('preserveAspectRatio')) {
      el.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }

    wireUi();
    setMode(Mode.NAVIGATE);
    waitForModuleAndAttach();
    render();
    setStatus('Ready. Add nodes first.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
