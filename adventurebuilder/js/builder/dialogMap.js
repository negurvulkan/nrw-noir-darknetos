import { dialogGraphInfo, nodeIds } from './dialogs.js';

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 640;

export function renderDialogMap({
  container,
  dialog,
  setDirty,
  onSelectNode,
  onEditChoice,
  mapState,
  onMapStateChange,
}) {
  container.innerHTML = '';
  const positions = dialog.meta.positions;

  if (!Object.keys(positions).length) {
    autoLayout(dialog, positions);
    setDirty(true);
  }

  const graphInfo = dialogGraphInfo(dialog);

  const wrap = document.createElement('div');
  wrap.className = 'dialog-map';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);
  const panGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const zoomGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  panGroup.appendChild(zoomGroup);
  svg.appendChild(panGroup);
  wrap.appendChild(svg);
  container.appendChild(wrap);

  const lines = [];
  const nodeGroups = {};

  const ensurePosition = (id, idx) => {
    if (positions[id]) return positions[id];
    const col = idx % 5;
    const row = Math.floor(idx / 5);
    positions[id] = { x: 140 + col * 180, y: 120 + row * 140 };
    return positions[id];
  };

  nodeIds(dialog).forEach((id, idx) => ensurePosition(id, idx));

  Object.entries(dialog.nodes).forEach(([fromId, node], nodeIdx) => {
    (node.choices || []).forEach((choice, choiceIdx) => {
      if (!choice.next || choice.next === 'end') return;
      const toId = choice.next;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.dataset.from = fromId;
      line.dataset.to = toId;
      line.dataset.choice = String(choiceIdx);
      line.setAttribute('class', 'dialog-edge');
      if (!dialog.nodes[toId]) line.classList.add('missing');
      zoomGroup.appendChild(line);
      lines.push(line);

      if (choice.text) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('class', 'dialog-edge-label');
        label.textContent = truncate(choice.text, 28);
        label.dataset.from = fromId;
        label.dataset.to = toId;
        label.dataset.choice = String(choiceIdx);
        zoomGroup.appendChild(label);
        lines.push(label);
      }
    });
  });

  Object.keys(dialog.nodes).forEach((id, idx) => {
    const pos = ensurePosition(id, idx);
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'dialog-node');
    if (graphInfo.unreachable.includes(id)) group.classList.add('unreachable');
    if (dialog.start === id) group.classList.add('start');

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('rx', '10');
    rect.setAttribute('ry', '10');
    rect.setAttribute('width', '150');
    rect.setAttribute('height', '70');

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('class', 'dialog-node-label');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.textContent = id;

    const update = (p) => {
      rect.setAttribute('x', p.x - 75);
      rect.setAttribute('y', p.y - 35);
      label.setAttribute('x', p.x);
      label.setAttribute('y', p.y);
    };

    update(pos);
    group.append(rect, label);
    zoomGroup.appendChild(group);
    nodeGroups[id] = { group, update };
  });

  const applyTransform = () => {
    panGroup.setAttribute('transform', `translate(${mapState.x} ${mapState.y})`);
    zoomGroup.setAttribute('transform', `scale(${mapState.scale})`);
  };

  const updateConnections = (id) => {
    const pos = positions[id];
    lines.forEach(el => {
      if (el.tagName === 'line') {
        if (el.dataset.from === id) {
          el.setAttribute('x1', pos.x);
          el.setAttribute('y1', pos.y);
        }
        if (el.dataset.to === id) {
          el.setAttribute('x2', positions[el.dataset.to]?.x || pos.x);
          el.setAttribute('y2', positions[el.dataset.to]?.y || pos.y);
        }
      } else if (el.tagName === 'text') {
        if (el.dataset.from === id || el.dataset.to === id) {
          const from = positions[el.dataset.from];
          const to = positions[el.dataset.to];
          if (from && to) {
            el.setAttribute('x', (from.x + to.x) / 2);
            el.setAttribute('y', (from.y + to.y) / 2 - 6);
          }
        }
      }
    });
  };

  const toMapCoords = (clientX, clientY) => {
    const rect = svg.getBoundingClientRect();
    const point = {
      x: ((clientX - rect.left) / rect.width) * MAP_WIDTH,
      y: ((clientY - rect.top) / rect.height) * MAP_HEIGHT,
    };
    return {
      x: (point.x - mapState.x) / mapState.scale,
      y: (point.y - mapState.y) / mapState.scale,
    };
  };

  applyTransform();
  lines.forEach(el => updateConnections(el.dataset.from));

  let dragging = null;
  let dragOffset = { x: 0, y: 0 };
  let isPanning = false;
  let lastPointer = { x: 0, y: 0 };

  svg.addEventListener('pointerdown', (e) => {
    isPanning = true;
    lastPointer = { x: e.clientX, y: e.clientY };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('panning');
  });

  Object.entries(nodeGroups).forEach(([id, node]) => {
    node.group.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dragging = id;
      const pointer = toMapCoords(e.clientX, e.clientY);
      dragOffset = { x: pointer.x - positions[id].x, y: pointer.y - positions[id].y };
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('dragging');
    });

    node.group.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelectNode(id);
    });
  });

  svg.addEventListener('pointermove', (e) => {
    if (dragging) {
      const pointer = toMapCoords(e.clientX, e.clientY);
      const next = { x: pointer.x - dragOffset.x, y: pointer.y - dragOffset.y };
      positions[dragging] = next;
      nodeGroups[dragging].update(next);
      updateConnections(dragging);
      return;
    }
    if (!isPanning) return;
    const rect = svg.getBoundingClientRect();
    const deltaX = ((e.clientX - lastPointer.x) / rect.width) * MAP_WIDTH;
    const deltaY = ((e.clientY - lastPointer.y) / rect.height) * MAP_HEIGHT;
    mapState.x += deltaX;
    mapState.y += deltaY;
    lastPointer = { x: e.clientX, y: e.clientY };
    applyTransform();
  });

  const stopDrag = (e) => {
    if (!dragging) return;
    setDirty(true);
    dragging = null;
    svg.classList.remove('dragging');
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  };

  const stopPan = (e) => {
    if (!isPanning) return;
    isPanning = false;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    svg.classList.remove('panning');
    onMapStateChange({ ...mapState });
  };

  svg.addEventListener('pointerup', (e) => { stopDrag(e); stopPan(e); });
  svg.addEventListener('pointerleave', (e) => { stopDrag(e); stopPan(e); });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const point = {
      x: ((e.clientX - rect.left) / rect.width) * MAP_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * MAP_HEIGHT,
    };
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.4, Math.min(3, mapState.scale * factor));
    const oldScale = mapState.scale;
    if (newScale === oldScale) return;
    mapState.x += (oldScale - newScale) * point.x;
    mapState.y += (oldScale - newScale) * point.y;
    mapState.scale = newScale;
    applyTransform();
    onMapStateChange({ ...mapState });
  }, { passive: false });

  lines.forEach(el => {
    el.addEventListener('click', (e) => {
      const from = el.dataset.from;
      const idx = Number(el.dataset.choice || '0');
      e.stopPropagation();
      onEditChoice(from, idx);
    });
  });

  const legend = document.createElement('div');
  legend.className = 'dialog-map-legend';
  legend.innerHTML = `
    <div><span class="legend-box start"></span>Start</div>
    <div><span class="legend-box unreachable"></span>Unreachable</div>
    <div><span class="legend-line missing"></span>Fehlendes Ziel</div>
  `;
  container.appendChild(legend);
}

export function autoLayout(dialog, positions) {
  const ids = nodeIds(dialog);
  const cols = Math.max(2, Math.ceil(Math.sqrt(ids.length)));
  ids.forEach((id, idx) => {
    positions[id] = {
      x: 140 + (idx % cols) * 180,
      y: 120 + Math.floor(idx / cols) * 140,
    };
  });
}

function truncate(text, len) {
  if (!text) return '';
  return text.length > len ? text.slice(0, len - 1) + '…' : text;
}
