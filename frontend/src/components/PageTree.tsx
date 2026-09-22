import { NavLink } from "@mantine/core";
import { IconFileText, IconFolder } from "@tabler/icons-react";
import { useMemo } from "react";

import type { TreeItem } from "../api/types";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
}

function buildTree(items: TreeItem[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [], isFile: false };
  const dirs = new Map<string, TreeNode>([["", root]]);

  for (const item of [...items].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = item.path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parent = dirs.get(parentPath) ?? root;
    const node: TreeNode = {
      name,
      path: item.path,
      children: [],
      isFile: item.type === "blob",
    };
    parent.children.push(node);
    if (item.type === "tree") dirs.set(item.path, node);
  }
  return root.children;
}

function TreeNodeView({
  node,
  selected,
  onSelect,
  metadata = false,
}: {
  node: TreeNode;
  selected: string | null;
  onSelect: (path: string) => void;
  metadata?: boolean;
}) {
  if (node.isFile) {
    const isDoc = metadata
      ? /\.(json|ya?ml)$/.test(node.name)
      : /\.(md|mdx)$/.test(node.name);
    if (!isDoc) return null;
    return (
      <NavLink
        label={node.name}
        leftSection={<IconFileText size={14} />}
        active={selected === node.path}
        onClick={() => onSelect(node.path)}
      />
    );
  }
  return (
    <NavLink
      label={node.name}
      leftSection={<IconFolder size={14} />}
      childrenOffset={16}
    >
      {node.children.map((child) => (
        <TreeNodeView
          key={child.path}
          node={child}
          selected={selected}
          onSelect={onSelect}
          metadata={metadata}
        />
      ))}
    </NavLink>
  );
}

export function PageTree({
  items,
  selected,
  onSelect,
  metadata = false,
}: {
  items: TreeItem[];
  selected: string | null;
  onSelect: (path: string) => void;
  metadata?: boolean;
}) {
  const tree = useMemo(() => buildTree(items), [items]);
  return (
    <>
      {tree.map((node) => (
        <TreeNodeView
          key={node.path}
          node={node}
          selected={selected}
          onSelect={onSelect}
          metadata={metadata}
        />
      ))}
    </>
  );
}
