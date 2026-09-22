import { ActionIcon, Box, NavLink } from '@mantine/core';
import { IconFileText, IconFolder, IconSettings } from '@tabler/icons-react';
import { useMemo } from 'react';

import type { TreeItem } from '../api/types';
import { friendlyName } from '../lib/authoring/folders';

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
}

function buildTree(items: TreeItem[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [], isFile: false };
  const dirs = new Map<string, TreeNode>([['', root]]);

  for (const item of [...items].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = item.path.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');
    const parent = dirs.get(parentPath) ?? root;
    const node: TreeNode = {
      name,
      path: item.path,
      children: [],
      isFile: item.type === 'blob',
    };
    parent.children.push(node);
    if (item.type === 'tree') dirs.set(item.path, node);
  }
  return root.children;
}

function TreeNodeView({
  node,
  selected,
  onSelect,
  metadata = false,
  selectedFolder,
  onFolderSelect,
  onFolderSettings,
}: {
  node: TreeNode;
  selected: string | null;
  onSelect: (path: string) => void;
  metadata?: boolean;
  selectedFolder?: string;
  onFolderSelect?: (path: string) => void;
  onFolderSettings?: (path: string) => void;
}) {
  if (node.isFile) {
    const isDoc = metadata
      ? /\.(json|ya?ml)$/.test(node.name)
      : /\.(md|mdx)$/.test(node.name);
    if (!isDoc) return null;
    return (
      <NavLink
        component="button"
        type="button"
        label={metadata ? node.name : friendlyName(node.name)}
        title={node.path}
        leftSection={<IconFileText size={14} />}
        active={selected === node.path}
        onClick={() => onSelect(node.path)}
      />
    );
  }
  return (
    <Box pos="relative">
      <NavLink
        component="button"
        type="button"
        aria-label={`Map ${friendlyName(node.name)}`}
        label={friendlyName(node.name)}
        title={node.path}
        leftSection={<IconFolder size={14} />}
        childrenOffset={16}
        active={selectedFolder === node.path}
        onClick={() => onFolderSelect?.(node.path)}
        defaultOpened
        styles={{ label: { paddingRight: onFolderSettings ? 26 : 0 } }}
      >
        {node.children.map((child) => (
          <TreeNodeView
            key={child.path}
            node={child}
            selected={selected}
            onSelect={onSelect}
            metadata={metadata}
            selectedFolder={selectedFolder}
            onFolderSelect={onFolderSelect}
            onFolderSettings={onFolderSettings}
          />
        ))}
      </NavLink>
      {onFolderSettings && (
        <ActionIcon
          pos="absolute"
          top={5}
          right={28}
          variant="subtle"
          aria-label={`Mapinstellingen ${friendlyName(node.name)}`}
          onClick={() => onFolderSettings(node.path)}
        >
          <IconSettings size={15} />
        </ActionIcon>
      )}
    </Box>
  );
}

export function PageTree({
  items,
  selected,
  onSelect,
  metadata = false,
  selectedFolder,
  onFolderSelect,
  onFolderSettings,
}: {
  items: TreeItem[];
  selected: string | null;
  onSelect: (path: string) => void;
  metadata?: boolean;
  selectedFolder?: string;
  onFolderSelect?: (path: string) => void;
  onFolderSettings?: (path: string) => void;
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
          selectedFolder={selectedFolder}
          onFolderSelect={onFolderSelect}
          onFolderSettings={onFolderSettings}
        />
      ))}
    </>
  );
}
