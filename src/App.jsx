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
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from '@mui/material';

/* =========================
   Helpers (tree-based model)
   ========================= */

const makeNode = (label, color, baseColor = null, depth = 0) => ({
  id: uuidv4(),
  label,
  color,
  baseColor,
  depth,
  children: [],
});

const cloneTree = (node) => ({
  ...node,
  children: node.children.map(cloneTree),
});

const findAndApply = (node, id, fn) => {
  if (node.id === id) return fn(node);
  return {
    ...node,
    children: node.children.map((c) => findAndApply(c, id, fn)),
  };
};

/* =========================
   App
   ========================= */

export default function App() {
  /* -------------------------
   * Tree state (arbitrary children)
   * ------------------------- */
  const [tree, setTree] = useState(() => {
    const root = makeNode("Root", "#ffffff", null, 0);
    const base = d3.schemeTableau10[0];
    root.children.push(makeNode("Sector 1", base, base, 1));
    return root;
  });

  /* -------------------------
   * Context menu
   * ------------------------- */
  const [contextMenu, setContextMenu] = useState(null);
  const [activeNodeId, setActiveNodeId] = useState(null);

  /* -------------------------
   * File open
   * ------------------------- */
  const fileInputRef = useRef(null);

  const openProject = () => fileInputRef.current?.click();

  const createProject = () => {
    const root = makeNode("Root", "#ffffff", null, 0);
    const base = d3.schemeTableau10[0];
    root.children.push(makeNode("Sector 1", base, base, 1));
    setTree(root);
  };

  /* -------------------------
   * Tree editing ops
   * ------------------------- */

  const addChild = () => {
    setTree((prev) =>
      findAndApply(cloneTree(prev), activeNodeId, (node) => {
        const base = node.baseColor ?? d3.schemeTableau10[node.children.length % 10];
        const depth = (node.depth ?? 0) + 1;
        const color = depth === 1 ? base : d3.color(base).brighter(depth - 1).formatHex();
        return {
          ...node,
          children: [...node.children, makeNode(`Child ${node.children.length + 1}`, color, base, depth)],
        };
      })
    );
    closeContextMenu();
  };

  const removeNode = () => {
    if (tree.id === activeNodeId) return;

    const removeRec = (node) => ({
      ...node,
      children: node.children
        .filter((c) => c.id !== activeNodeId)
        .map(removeRec),
    });

    setTree((prev) => removeRec(cloneTree(prev)));
    closeContextMenu();
  };

  /* -------------------------
   * D3 hierarchy
   * ------------------------- */
  const root = useMemo(() => {
    return d3.hierarchy(tree).sum(d => (d.children && d.children.length ? 0 : 1));
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
   * Render
   * ------------------------- */
  return (
    <Box height="100vh" display="flex" flexDirection="column">
      {/* Menu Bar */}
      <AppBar position="static" elevation={1}>
        <Toolbar variant="dense">
          <Typography sx={{ flexGrow: 1 }}>SunLinker</Typography>
          <Button color="inherit" size="small" onClick={createProject}>Create</Button>
          <Button color="inherit" size="small" onClick={openProject}>Open</Button>
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
        <Typography variant="body2">Right‑click a sector to edit</Typography>
      </Box>

      {/* Graph Workspace */}
      <Box flex={1} display="flex" justifyContent="center" alignItems="center">
        <svg width="100vw" height={720} viewBox="0 0 720 720" preserveAspectRatio="xMidYMid meet">
          <g transform="translate(360,360)">
            {/* Root node as center circle */}
            <circle
              r={partition.descendants()[1]?.y0 * 90 || 40}
              fill={tree.color}
              onContextMenu={(e) => onRightClick(e, tree.id)}
            />
            {/* Sunburst sectors (exclude root) */}
            {partition.descendants().slice(1).map((d) => {
              const arc = d3
                .arc()
                .innerRadius(d.y0 * 90)
                .outerRadius(d.y1 * 90)
                .startAngle(d.x0)
                .endAngle(d.x1);

              return (
                <path
                  key={d.data.id}
                  d={arc()}
                  fill={d.data.color}
                  stroke="#ffffff" strokeWidth={1}
                  onContextMenu={(e) => onRightClick(e, d.data.id)}
                />
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
        <MenuItem onClick={removeNode}>Remove</MenuItem>
      </Menu>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
      />
    </Box>
  );
}
