import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "../types";

interface TabInfo {
  path: string;
  md_mode?: string;
}

interface PanelWidths {
  sidebar_width?: number | null;
  agent_width?: number | null;
}

interface ProjectState {
  expanded_paths: string[];
  current_file: string | null;
  open_tabs: TabInfo[];
  panel_widths?: PanelWidths;
}

interface FileTreeProps {
  projectRoot: string;
  onFileSelect: (path: string) => void;
  onExpandedChange?: (paths: Set<string>) => void;
  onReady?: (
    savedFile: string | null,
    openTabs: TabInfo[],
    panelWidths?: PanelWidths
  ) => void;
  getCurrentFile?: () => string | null;
  getPanelWidths?: () => PanelWidths | undefined;
}

const SAVE_DEBOUNCE_MS = 500;

// ─── 上下文菜单类型 ──────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  targetPath: string | null; // null = 空白区域
  isDir: boolean;
}

interface ClipboardState {
  path: string;
  name: string;
  mode: "copy" | "cut";
}

// ─── 节点组件 ──────────────────────────────────────────────

function FileTreeNode({
  node,
  depth,
  expandedPaths,
  selectedPath,
  renamingPath,
  renameValue,
  creatingIn,
  onToggle,
  onFileSelect,
  onContextMenu,
  onSelect,
  onCloseContextMenu,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onCreateCommit,
  onCreateCancel,
}: {
  node: FileNode;
  depth: number;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  renamingPath: string | null;
  renameValue: string;
  creatingIn: { parentPath: string; type: "file" | "folder" } | null;
  onToggle: (path: string) => void;
  onFileSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void;
  onSelect: (path: string) => void;
  onCloseContextMenu: () => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onCreateCommit: (name: string) => void;
  onCreateCancel: () => void;
}) {
  const expanded = node.is_dir && expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isRenaming = renamingPath === node.path;
  const isCreating = creatingIn !== null && creatingIn.parentPath === node.path;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ((isRenaming || isCreating) && inputRef.current) {
      inputRef.current.focus();
      if (isRenaming) {
        // 选中文件名（不含扩展名）
        const dotIdx = renameValue.lastIndexOf(".");
        if (dotIdx > 0) {
          inputRef.current.setSelectionRange(0, dotIdx);
        } else {
          inputRef.current.select();
        }
      }
    }
  }, [isRenaming, isCreating]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCloseContextMenu();
    onSelect(node.path);
    if (node.is_dir) {
      if (depth > 0) onToggle(node.path);
    } else {
      onFileSelect(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(node.path);
    onContextMenu(e, node.path, node.is_dir);
  };

  return (
    <div>
      <div
        className={`file-tree-node${isSelected ? " selected" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <span className="icon">{node.is_dir ? (expanded ? "📂" : "📁") : "📄"}</span>
        {isRenaming ? (
          <input
            ref={inputRef}
            className="file-tree-node-input"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameCommit();
              else if (e.key === "Escape") onRenameCancel();
              e.stopPropagation();
            }}
            onBlur={onRenameCommit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="name">{node.name}</span>
        )}
      </div>
      {node.is_dir && expanded && (
        <>
          {node.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              renamingPath={renamingPath}
              renameValue={renameValue}
              creatingIn={creatingIn}
              onToggle={onToggle}
              onFileSelect={onFileSelect}
              onContextMenu={onContextMenu}
              onSelect={onSelect}
              onCloseContextMenu={onCloseContextMenu}
              onRenameChange={onRenameChange}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onCreateCommit={onCreateCommit}
              onCreateCancel={onCreateCancel}
            />
          ))}
          {isCreating && (
            <div
              className="file-tree-node selected"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              <span className="icon">{creatingIn.type === "folder" ? "📁" : "📄"}</span>
              <input
                ref={inputRef}
                className="file-tree-node-input"
                placeholder={creatingIn.type === "folder" ? "新建文件夹名称..." : "新建文件名..."}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                    onCreateCommit((e.target as HTMLInputElement).value.trim());
                  } else if (e.key === "Escape") {
                    onCreateCancel();
                  }
                  e.stopPropagation();
                }}
                onBlur={(e) => {
                  if (e.target.value.trim()) {
                    onCreateCommit(e.target.value.trim());
                  } else {
                    onCreateCancel();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────

export default function FileTree({ projectRoot, onFileSelect, onExpandedChange, onReady, getCurrentFile, getPanelWidths }: FileTreeProps) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const expandedRef = useRef(expandedPaths);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 选中状态
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // 内联重命名
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // 内联新建
  const [creatingIn, setCreatingIn] = useState<{ parentPath: string; type: "file" | "folder" } | null>(null);

  // 剪贴板
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);

  expandedRef.current = expandedPaths;

  // ─── 刷新目录树 ──────────────────────────────────────

  const refreshTree = useCallback(async () => {
    try {
      const treeNode = await invoke<FileNode>("get_project_tree", { path: projectRoot });
      setTree(treeNode);
    } catch (err) {
      console.error("刷新目录树失败:", err);
    }
  }, [projectRoot]);

  // ─── 防抖保存展开状态 ──────────────────────────────────

  useEffect(() => {
    if (!tree) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const paths = Array.from(expandedRef.current);
      const currentFile = getCurrentFile?.() ?? null;
      const panelWidths = getPanelWidths?.();
      invoke("save_tree_state", {
        projectPath: projectRoot,
        expandedPaths: paths,
        currentFile,
        panelWidths,
      }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [expandedPaths, projectRoot, tree, getCurrentFile, getPanelWidths]);

  // ─── 初始加载 ──────────────────────────────────────

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
          const restored = new Set(savedPaths);
          setExpandedPaths(restored);
          onExpandedChange?.(restored);
        } else {
          const initial = new Set([treeNode.path]);
          setExpandedPaths(initial);
          onExpandedChange?.(initial);
        }
        onReady?.(state.current_file, state.open_tabs || [], state.panel_widths);
      })
      .catch(console.error);
  }, [projectRoot]);

  // ─── 展开/收起 ──────────────────────────────────────

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      onExpandedChange?.(next);
      return next;
    });
  }, [onExpandedChange]);

  // ─── 右键菜单 ──────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, isDir: boolean) => {
    setContextMenu({ x: e.clientX, y: e.clientY, targetPath: path, isDir });
  }, []);

  const handleBlankContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, targetPath: null, isDir: true });
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    const close = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener("click", close);
      return () => window.removeEventListener("click", close);
    }
  }, [contextMenu]);

  // ─── 菜单动作 ──────────────────────────────────────

  const handleMenuAction = useCallback(async (action: string) => {
    if (!contextMenu) return;
    const targetPath = contextMenu.targetPath;
    setContextMenu(null);

    switch (action) {
      case "new-file": {
        const parent = targetPath || projectRoot;
        // 确保父目录展开
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.add(parent);
          onExpandedChange?.(next);
          return next;
        });
        setCreatingIn({ parentPath: parent, type: "file" });
        break;
      }
      case "new-folder": {
        const parent = targetPath || projectRoot;
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.add(parent);
          onExpandedChange?.(next);
          return next;
        });
        setCreatingIn({ parentPath: parent, type: "folder" });
        break;
      }
      case "rename": {
        if (!targetPath) break;
        const name = targetPath.split(/[\\/]/).pop() || "";
        setRenamingPath(targetPath);
        setRenameValue(name);
        break;
      }
      case "delete": {
        if (!targetPath) break;
        const name = targetPath.split(/[\\/]/).pop() || "";
        setDeleteTarget({ path: targetPath, name });
        break;
      }
      case "copy": {
        if (!targetPath) break;
        const name = targetPath.split(/[\\/]/).pop() || "";
        setClipboard({ path: targetPath, name, mode: "copy" });
        break;
      }
      case "cut": {
        if (!targetPath) break;
        const name = targetPath.split(/[\\/]/).pop() || "";
        setClipboard({ path: targetPath, name, mode: "cut" });
        break;
      }
      case "paste": {
        if (!clipboard) break;
        const parent = targetPath || projectRoot;
        const srcName = clipboard.path.split(/[\\/]/).pop() || "";
        const dstPath = parent + (parent.endsWith("\\") || parent.endsWith("/") ? "" : "\\") + srcName;
        try {
          if (clipboard.mode === "copy") {
            await invoke("copy_entry", { src: clipboard.path, dst: dstPath });
          } else {
            await invoke("rename_entry", { oldPath: clipboard.path, newPath: dstPath });
          }
          setClipboard(null);
          await refreshTree();
        } catch (err) {
          alert(`粘贴失败: ${err}`);
        }
        break;
      }
      case "refresh": {
        await refreshTree();
        break;
      }
    }
  }, [contextMenu, clipboard, projectRoot, refreshTree, onExpandedChange]);

  // ─── 内联重命名提交 ──────────────────────────────────

  const handleRenameCommit = useCallback(async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }
    const parentDir = renamingPath.substring(0, renamingPath.lastIndexOf("\\")) ||
                      renamingPath.substring(0, renamingPath.lastIndexOf("/"));
    const newPath = parentDir + (parentDir.endsWith("\\") || parentDir.endsWith("/") ? "" : "\\") + renameValue.trim();
    if (newPath === renamingPath) {
      setRenamingPath(null);
      return;
    }
    try {
      await invoke("rename_entry", { oldPath: renamingPath, newPath });
      await refreshTree();
    } catch (err) {
      alert(`重命名失败: ${err}`);
    }
    setRenamingPath(null);
  }, [renamingPath, renameValue, refreshTree]);

  // ─── 内联新建提交 ──────────────────────────────────

  const handleCreateCommit = useCallback(async (name: string) => {
    if (!creatingIn || !name.trim()) {
      setCreatingIn(null);
      return;
    }
    const parent = creatingIn.parentPath;
    const sep = parent.includes("\\") ? "\\" : "/";
    const fullPath = parent + sep + name.trim();
    try {
      if (creatingIn.type === "file") {
        await invoke("create_file", { path: fullPath });
      } else {
        await invoke("create_directory", { path: fullPath });
      }
      await refreshTree();
    } catch (err) {
      alert(`创建失败: ${err}`);
    }
    setCreatingIn(null);
  }, [creatingIn, refreshTree]);

  // ─── 删除确认 ──────────────────────────────────────

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await invoke("delete_entry", { path: deleteTarget.path });
      // 如果删除的是当前选中文件，清空选中
      if (selectedPath === deleteTarget.path) {
        setSelectedPath(null);
      }
      await refreshTree();
    } catch (err) {
      alert(`删除失败: ${err}`);
    }
    setDeleteTarget(null);
  }, [deleteTarget, selectedPath, refreshTree]);

  // ─── 键盘快捷键 ──────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果正在输入（input/textarea），不处理
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!selectedPath) return;

      if (e.key === "F2") {
        e.preventDefault();
        const name = selectedPath.split(/[\\/]/).pop() || "";
        setRenamingPath(selectedPath);
        setRenameValue(name);
      } else if (e.key === "Delete") {
        e.preventDefault();
        const name = selectedPath.split(/[\\/]/).pop() || "";
        setDeleteTarget({ path: selectedPath, name });
      } else if (e.key === "c" && e.ctrlKey) {
        const name = selectedPath.split(/[\\/]/).pop() || "";
        setClipboard({ path: selectedPath, name, mode: "copy" });
      } else if (e.key === "x" && e.ctrlKey) {
        const name = selectedPath.split(/[\\/]/).pop() || "";
        setClipboard({ path: selectedPath, name, mode: "cut" });
      } else if (e.key === "v" && e.ctrlKey && clipboard) {
        // 粘贴到选中节点的父目录（如果是文件）或自身（如果是目录）
        // 简化处理：粘贴到选中节点所在目录
        e.preventDefault();
        const parentDir = selectedPath.substring(0, selectedPath.lastIndexOf("\\")) ||
                          selectedPath.substring(0, selectedPath.lastIndexOf("/"));
        const srcName = clipboard.path.split(/[\\/]/).pop() || "";
        const dstPath = parentDir + (parentDir.endsWith("\\") || parentDir.endsWith("/") ? "" : "\\") + srcName;
        invoke(clipboard.mode === "copy" ? "copy_entry" : "rename_entry",
          clipboard.mode === "copy"
            ? { src: clipboard.path, dst: dstPath }
            : { oldPath: clipboard.path, newPath: dstPath }
        )
          .then(() => { setClipboard(null); refreshTree(); })
          .catch((err) => alert(`粘贴失败: ${err}`));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPath, clipboard, refreshTree]);

  // ─── 组件卸载清理 ──────────────────────────────────

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ─── 构建右键菜单项 ──────────────────────────────────

  const renderContextMenu = () => {
    if (!contextMenu) return null;

    const items: { label: string; action: string; danger?: boolean; separator?: boolean; disabled?: boolean }[] = [];

    if (contextMenu.targetPath) {
      // 在节点上右键
      if (contextMenu.isDir) {
        items.push({ label: "新建文件", action: "new-file" });
        items.push({ label: "新建文件夹", action: "new-folder" });
        items.push({ label: "", action: "", separator: true });
      }
      items.push({ label: "复制", action: "copy" });
      items.push({ label: "剪切", action: "cut" });
      if (contextMenu.isDir) {
        items.push({ label: "粘贴", action: "paste", disabled: !clipboard });
        items.push({ label: "", action: "", separator: true });
      }
      items.push({ label: "重命名", action: "rename" });
      items.push({ label: "删除", action: "delete", danger: true });
    } else {
      // 在空白区域右键
      items.push({ label: "新建文件", action: "new-file" });
      items.push({ label: "新建文件夹", action: "new-folder" });
      items.push({ label: "", action: "", separator: true });
      items.push({ label: "粘贴", action: "paste", disabled: !clipboard });
      items.push({ label: "", action: "", separator: true });
      items.push({ label: "刷新", action: "refresh" });
    }

    // 估算菜单尺寸，防止溢出视口
    const itemHeight = 32; // padding 6px*2 + font 13px + separator ~
    const menuHeight = items.length * itemHeight;
    const menuWidth = 180;
    let menuX = contextMenu.x;
    let menuY = contextMenu.y;
    if (menuY + menuHeight > window.innerHeight) {
      menuY = Math.max(8, window.innerHeight - menuHeight - 8);
    }
    if (menuX + menuWidth > window.innerWidth) {
      menuX = Math.max(8, window.innerWidth - menuWidth - 8);
    }

    return (
      <div
        className="context-menu"
        style={{ left: menuX, top: menuY }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, idx) => {
          if (item.separator) {
            return <div key={idx} className="context-menu-separator" />;
          }
          return (
            <div
              key={idx}
              className={`context-menu-item${item.danger ? " danger" : ""}${item.disabled ? " disabled" : ""}`}
              onClick={() => !item.disabled && handleMenuAction(item.action)}
            >
              {item.label}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="file-tree" onContextMenu={handleBlankContextMenu}>
      {tree ? (
        <FileTreeNode
          node={tree}
          depth={0}
          expandedPaths={expandedPaths}
          selectedPath={selectedPath}
          renamingPath={renamingPath}
          renameValue={renameValue}
          creatingIn={creatingIn}
          onToggle={handleToggle}
          onFileSelect={onFileSelect}
          onContextMenu={handleContextMenu}
          onSelect={setSelectedPath}
          onCloseContextMenu={() => setContextMenu(null)}
          onRenameChange={setRenameValue}
          onRenameCommit={handleRenameCommit}
          onRenameCancel={() => setRenamingPath(null)}
          onCreateCommit={handleCreateCommit}
          onCreateCancel={() => setCreatingIn(null)}
        />
      ) : (
        <div className="file-tree-empty">加载中...</div>
      )}

      {/* 右键上下文菜单 */}
      {renderContextMenu()}

      {/* 删除确认对话框 */}
      {deleteTarget && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <div className="confirm-title">确认删除</div>
            <div className="confirm-message">
              确定要删除「{deleteTarget.name}」吗？此操作不可撤销。
            </div>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn-danger" onClick={handleDeleteConfirm}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
