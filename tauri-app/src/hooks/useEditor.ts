import { useEffect, useRef, useCallback } from "react";

export function useEditor(containerId: string) {
  const editorRef = useRef<unknown>(null);

  const initEditor = useCallback((content: string) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    // TODO: 初始化 Monaco Editor
    // import("monaco-editor").then((monaco) => {
    //   editorRef.current = monaco.editor.create(container, {
    //     value: content,
    //     language: "markdown",
    //     theme: "vs-dark",
    //     wordWrap: "on",
    //     minimap: { enabled: false },
    //     automaticLayout: true,
    //   });
    // });
  }, [containerId]);

  const setContent = useCallback((content: string) => {
    // TODO: editorRef.current?.setValue(content);
  }, []);

  const getContent = useCallback((): string => {
    // TODO: return editorRef.current?.getValue() ?? "";
    return "";
  }, []);

  const dispose = useCallback(() => {
    // TODO: editorRef.current?.dispose();
    editorRef.current = null;
  }, []);

  useEffect(() => {
    return () => dispose();
  }, [dispose]);

  return { initEditor, setContent, getContent, dispose };
}
