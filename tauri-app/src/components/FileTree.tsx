import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "../types";

interface TabInfo {
  path: string;
  md_mode?: string;
}

interface ProjectState {
  expanded_paths: string[];
  current_file: string | null;
  open_tabs: TabInfo[];
}

interface FileTreeProps {
  projectRoot: string;
  onFileSelect: (path: string) => void;
  onExpandedChange?: (paths: Set<string>) => void;
  onReady?: (savedFile: string | null, openTabs: TabInfo[]) => void;
  getCurrentFile?: () => string | null;
}

const SAVE_DEBOUNCE_MS = 500;

function FileTreeNode({
  node,
  depth,
  expandedPaths,
  onToggle,
  onFileSelect,
}: {
  node: FileNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onFileSelect: (path: string) => void;
}) {
  const expanded = node.is_dir && expandedPaths.has(node.path);

  const handleClick = () => {
    if (node.is_dir) {
      // 根节点不允许收起
      if (depth > 0) onToggle(node.path);
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
        <FileTreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          expandedPaths={expandedPaths}
          onToggle={onToggle}
          onFileSelect={onFileSelect}
        />
      ))}
    </div>
  );
}

export default function FileTree({ projectRoot, onFileSelect, onExpandedChange, onReady, getCurrentFile }: FileTreeProps) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const expandedRef = useRef(expandedPaths);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  expandedRef.current = expandedPaths;

  // 防抖保存：展开状态变化后自动持久化
  useEffect(() => {
    if (!tree) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const paths = Array.from(expandedRef.current);
      const currentFile = getCurrentFile?.() ?? null;
      invoke("save_tree_state", {
        projectPath: projectRoot,
        expandedPaths: paths,
        currentFile,
      }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [expandedPaths, projectRoot, tree, getCurrentFile]);

  // 加载目录树 + 恢复展开状态 + 恢复当前文件
  useEffect(() => {
    setExpandedPaths(new Set());
    Promise.all([
      invoke<FileNode>("get_project_tree", { path: projectRoot }),
      invoke<ProjectState>("load_tree_state", { projectPath: projectRoot }),
    ])
      .then(([treeNode, state]) => {
        setTree(treeNode);
        const savedPaths = state.expanded_paths ?? [];
        if (savedPaths.length > 0) {
          // 恢复上次展开状态
          const restored = new Set(savedPaths);
          setExpandedPaths(restored);
          onExpandedChange?.(restored);
        } else {
          // 首次打开：自动展开根节点
          const initial = new Set([treeNode.path]);
          setExpandedPaths(initial);
          onExpandedChange?.(initial);
        }
        // 通知 App 恢复文件
        onReady?.(state.current_file, state.open_tabs || []);
      })
      .catch(console.error);
  }, [projectRoot]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      onExpandedChange?.(next);
      return next;
    });
  }, [onExpandedChange]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <div className="file-tree">
      {tree ? (
        <FileTreeNode
          node={tree}
          depth={0}
          expandedPaths={expandedPaths}
          onToggle={handleToggle}
          onFileSelect={onFileSelect}
        />
      ) : (
        <div className="file-tree-empty">加载中...</div>
      )}
    </div>
  );
}
