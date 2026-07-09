import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "../types";

interface FileTreeProps {
  projectRoot: string;
  onFileSelect: (path: string) => void;
}

function FileTreeNode({ node, depth, onFileSelect }: { node: FileNode; depth: number; onFileSelect: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  const handleClick = () => {
    if (node.is_dir) {
      setExpanded(!expanded);
    } else {
      onFileSelect(node.path);
    }
  };

  return (
    <div>
      <div
        className="file-tree-node"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        <span className="icon">{node.is_dir ? (expanded ? "📂" : "📁") : "📄"}</span>
        <span className="name">{node.name}</span>
      </div>
      {node.is_dir && expanded && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} onFileSelect={onFileSelect} />
      ))}
    </div>
  );
}

export default function FileTree({ projectRoot, onFileSelect }: FileTreeProps) {
  const [tree, setTree] = useState<FileNode | null>(null);

  useEffect(() => {
    invoke<FileNode>("get_project_tree", { path: projectRoot })
      .then(setTree)
      .catch(console.error);
  }, [projectRoot]);

  return (
    <div className="file-tree">
      {tree ? (
        <FileTreeNode node={tree} depth={0} onFileSelect={onFileSelect} />
      ) : (
        <div className="file-tree-empty">加载中...</div>
      )}
    </div>
  );
}
