import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "../types";

export function useFileSystem() {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const loadTree = useCallback(async () => {
    try {
      const result = await invoke<FileNode>("get_project_tree", {});
      setTree(result);
    } catch (err) {
      console.error("加载目录树失败:", err);
    }
  }, []);

  const openFile = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const result = await invoke<string>("read_file", { path });
      setCurrentFile(path);
      setContent(result);
    } catch (err) {
      console.error("读取文件失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveFile = useCallback(async () => {
    if (!currentFile) return;
    try {
      await invoke("write_file", { path: currentFile, content });
    } catch (err) {
      console.error("保存文件失败:", err);
    }
  }, [currentFile, content]);

  return { tree, currentFile, content, loading, loadTree, openFile, saveFile, setContent };
}
