import {
  useMemo,
  useRef,
  useState,
} from 'react';

import * as d3 from 'd3';
import { v4 as uuidv4 } from 'uuid';

import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import {
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';

/* =========================
   Helpers (tree-based model)
   ========================= */

const makeNode = (label = "Node", color, baseColor = null, depth = 0) => ({
  id: uuidv4(),
  label,
  color,
  baseColor,
  depth,
  children: [],
  vertices: [], // only meaningful on outermost ring
});

const cloneTree = (node) => ({
  ...node,
  children: node.children.map(cloneTree),
  vertices: Array.isArray(node.vertices) ? [...node.vertices] : [],
});

const findAndApply = (node, id, fn) => {
  if (node.id === id) return fn(node);
  return {
    ...node,
    children: node.children.map((c) => findAndApply(c, id, fn)),
  };
};

const clearAllVertices = (node) => ({
  ...node,
  vertices: [],
  children: node.children.map(clearAllVertices),
});

/* =========================
   App
   ========================= */

export default function App() {
  /* -------------------------
   * Tree state
   * ------------------------- */
  const [tree, setTree] = useState(() => {
    const root = makeNode("Root", "#ffffff", null, 0);
    const base = d3.schemeTableau10[0];
    root.children.push(makeNode("Node", base, base, 1));
    return root;
  });

  /* -------------------------
   * Context menu
   * ------------------------- */
  const [contextMenu, setContextMenu] = useState(null);
  const [activeNodeId, setActiveNodeId] = useState(null);

  /* -------------------------
   * Drag-to-link
   * ------------------------- */
  const [dragVertexId, setDragVertexId] = useState(null);
  const [edges, setEdges] = useState([]); // {from, to}

  /* -------------------------
   * Edit dialog (text)
   * ------------------------- */
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");

  /* -------------------------
   * File open (stub)
   * ------------------------- */
  const fileInputRef = useRef(null);
  const openProject = () => fileInputRef.current?.click();

  const createProject = () => {
    const root = makeNode("Root", "#ffffff", null, 0);
    const base = d3.schemeTableau10[0];
    root.children.push(makeNode("Node", base, base, 1));
    setTree(root);
    setEdges([]);
    setDragVertexId(null);
  };

  /* -------------------------
   * D3 hierarchy
   * ------------------------- */
  const root = useMemo(() => {
    // Leaf-mass only; internal nodes contribute zero angle.
    return d3.hierarchy(tree).sum((d) => (d.children && d.children.length ? 0 : 1));
  }, [tree]);

  const partition = useMemo(() => {
    return d3.partition().size([2 * Math.PI, root.height + 1])(root);
  }, [root]);

  /* -------------------------
   * Context menu handlers
   * ------------------------- */
  const onRightClick = (event, nodeId) => {
    event.preventDefault();
    setActiveNodeId(nodeId);
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  /* -------------------------
   * Tree editing ops
   * ------------------------- */

  const addChild = () => {
    setTree((prev) => {
      // creating a deeper ring invalidates vertices: remove all.
      const cleared = clearAllVertices(cloneTree(prev));
      return findAndApply(cleared, activeNodeId, (node) => {
        const base = node.baseColor ?? d3.schemeTableau10[node.children.length % 10];
        const depth = (node.depth ?? 0) + 1;
        const color = depth === 1 ? base : d3.color(base).brighter(depth - 1).formatHex();
        return {
          ...node,
          children: [...node.children, makeNode("Node", color, base, depth)],
        };
      });
    });

    // any structural change invalidates edges too (vertices wiped)
    setEdges([]);
    setDragVertexId(null);
    closeContextMenu();
  };

  const removeNode = () => {
    if (tree.id === activeNodeId) return;

    const removeRec = (node) => ({
      ...node,
      children: node.children
        .filter((c) => c.id !== activeNodeId)
        .map(removeRec),
      vertices: Array.isArray(node.vertices) ? [...node.vertices] : [],
    });

    setTree((prev) => removeRec(cloneTree(prev)));
    // edges may reference deleted vertices; simplest is to clear
    setEdges([]);
    setDragVertexId(null);
    closeContextMenu();
  };

  const openEdit = () => {
    const find = (node) => {
      if (node.id === activeNodeId) return node;
      for (const c of node.children) {
        const r = find(c);
        if (r) return r;
      }
      return null;
    };
    const n = find(tree);
    setEditText(n?.label ?? "");
    setEditOpen(true);
    closeContextMenu();
  };

  const applyEdit = () => {
    setTree((prev) =>
      findAndApply(cloneTree(prev), activeNodeId, (node) => ({
        ...node,
        label: editText,
      }))
    );
    setEditOpen(false);
  };

  const createVertex = () => {
    setTree((prev) =>
      findAndApply(cloneTree(prev), activeNodeId, (node) => ({
        ...node,
        vertices: [
          ...(Array.isArray(node.vertices) ? node.vertices : []),
          {
            id: uuidv4(),
            // one level deeper than the sector
            color: d3.color(node.color).brighter(1).formatHex(),
          },
        ],
      }))
    );
    closeContextMenu();
  };

  /* -------------------------
   * Derived: vertex positions (for edges)
   * ------------------------- */
  const vertexPos = useMemo(() => {
    const pos = new Map();
    const outerDepth = root.height;

    for (const d of partition.descendants().slice(1)) {
      const isOutermostSector = (!d.children || d.children.length === 0) && d.depth === outerDepth;
      if (!isOutermostSector) continue;

      const vs = d.data.vertices || [];
      if (!Array.isArray(vs) || vs.length === 0) continue;

      const outerR = d.y1 * 90;
      const segAngle = (d.x1 - d.x0) / (vs.length + 1);

      for (let i = 0; i < vs.length; i++) {
        const a = d.x0 + segAngle * (i + 1);
        const x = Math.cos(a - Math.PI / 2) * outerR;
        const y = Math.sin(a - Math.PI / 2) * outerR;
        pos.set(vs[i].id, { x, y, color: vs[i].color });
      }
    }

    return pos;
  }, [partition, root.height]);

  /* -------------------------
   * Render
   * ------------------------- */
  const outerDepth = root.height;

  return (
    <Box height="100vh" display="flex" flexDirection="column">
      {/* Menu Bar */}
      <AppBar position="static" elevation={1}>
        <Toolbar variant="dense">
          <Typography sx={{ flexGrow: 1 }}>SunLinker</Typography>
          <Button color="inherit" size="small" onClick={createProject}>
            Create
          </Button>
          <Button color="inherit" size="small" onClick={openProject}>
            Open
          </Button>
          <Button color="inherit" size="small">Save</Button>
          <Button color="inherit" size="small">Export</Button>
        </Toolbar>
      </AppBar>

      {/* Toolbar */}
      <Box
        height={40}
        display="flex"
        alignItems="center"
        px={2}
        gap={1}
        sx={{ borderBottom: "1px solid", borderColor: "divider" }}
      >
        <IconButton size="small" disabled>
          <AddIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" disabled>
          <RemoveIcon fontSize="small" />
        </IconButton>
        <Divider orientation="vertical" flexItem />
        <Typography variant="body2">Right‑click a sector to edit; drag between vertices to link</Typography>
      </Box>

      {/* Graph Workspace */}
      <Box flex={1} display="flex" justifyContent="center" alignItems="center">
        <svg width="100vw" height={720} viewBox="0 0 720 720" preserveAspectRatio="xMidYMid meet">
          <g transform="translate(360,360)">
            {/* Edges */}
            {edges.map((e, i) => {
              const p1 = vertexPos.get(e.from);
              const p2 = vertexPos.get(e.to);
              if (!p1 || !p2) return null;
              return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#000" />;
            })}

            {/* Root node */}
            <circle
              r={partition.descendants()[1]?.y0 * 90 || 40}
              fill={tree.color}
              onContextMenu={(e) => onRightClick(e, tree.id)}
            />

            {/* Sunburst sectors + labels + vertices */}
            {partition.descendants().slice(1).map((d) => {
              const arc = d3
                .arc()
                .innerRadius(d.y0 * 90)
                .outerRadius(d.y1 * 90)
                .startAngle(d.x0)
                .endAngle(d.x1);

              // label center
              const angle = (d.x0 + d.x1) / 2;
              const radius = ((d.y0 + d.y1) / 2) * 90;
              const angleDeg = (angle * 180) / Math.PI;
              const rotate = angleDeg - 90;
              const flip = angleDeg > 90 && angleDeg < 270 ? 180 : 0;

              const rgb = d3.color(d.data.color);
              const luminance = rgb ? (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 : 1;
              const textColor = luminance > 0.5 ? "#000" : "#fff";

              const isOutermostSector = (!d.children || d.children.length === 0) && d.depth === outerDepth;
              const vs = Array.isArray(d.data.vertices) ? d.data.vertices : [];

              return (
                <g key={d.data.id}>
                  <path
                    d={arc()}
                    fill={d.data.color}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onContextMenu={(e) => onRightClick(e, d.data.id)}
                  />

                  <text
                    transform={`rotate(${rotate}) translate(${radius},0) rotate(${flip + 90})`}
                    dy="0.35em"
                    textAnchor="middle"
                    fontSize={15}
                    fill={textColor}
                    style={{ pointerEvents: "none" }}
                  >
                    {d.data.label}
                  </text>

                  {/* Vertices (outermost ring only; all at same radius) */}
                  {isOutermostSector &&
                    vs.map((v, i) => {
                      const p = vertexPos.get(v.id);
                      if (!p) return null;

                      return (
                        <circle
                          key={v.id}
                          cx={p.x}
                          cy={p.y}
                          r={5}
                          fill={v.color}
                          stroke="#000"
                          strokeWidth={1}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragVertexId(v.id);
                          }}
                          onMouseUp={(e) => {
                            e.stopPropagation();
                            if (dragVertexId && dragVertexId !== v.id) {
                              setEdges((prev) => [...prev, { from: dragVertexId, to: v.id }]);
                            }
                            setDragVertexId(null);
                          }}
                        />
                      );
                    })}
                </g>
              );
            })}
          </g>
        </svg>
      </Box>

      {/* Context Menu */}
      <Menu
        open={Boolean(contextMenu)}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
      >
        <MenuItem onClick={addChild}>Add Child</MenuItem>
        <MenuItem onClick={openEdit}>Edit Text</MenuItem>
        <MenuItem onClick={createVertex}>Create Vertex</MenuItem>
        <MenuItem onClick={removeNode}>Remove</MenuItem>
      </Menu>

      {/* Edit Text Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
        <DialogTitle>Edit Label</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={applyEdit} variant="contained">
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: "none" }} />
    </Box>
  );
}
