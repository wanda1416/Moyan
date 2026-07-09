import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "../types";

interface FileTreeProps {
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

export default function FileTree({ onFileSelect }: FileTreeProps) {
  const [tree, setTree] = useState<FileNode | null>(null);

  useEffect(() => {
    // TODO: 通过 IPC 获取项目目录树
    invoke<FileNode>("get_project_tree", {}).then(setTree).catch(console.error);
  }, []);

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <h3>项目文件</h3>
      </div>
      {tree ? (
        <FileTreeNode node={tree} depth={0} onFileSelect={onFileSelect} />
      ) : (
        <div className="file-tree-empty">未打开项目</div>
      )}
    </div>
  );
}
