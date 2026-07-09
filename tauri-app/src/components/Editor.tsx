import { useEffect, useRef } from "react";

interface EditorProps {
  filePath: string | null;
  content: string;
  onChange: (value: string) => void;
}

export default function Editor({ filePath, content, onChange }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // TODO: 初始化 Monaco Editor
    // import * as monaco from "monaco-editor";
    // const editor = monaco.editor.create(containerRef.current, {
    //   value: content,
    //   language: "markdown",
    //   theme: "vs-dark",
    //   wordWrap: "on",
    //   minimap: { enabled: false },
    // });
    // editor.onDidChangeModelContent(() => {
    //   onChange(editor.getValue());
    // });

    return () => {
      // editor.dispose();
    };
  }, [filePath]);

  if (!filePath) {
    return (
      <div className="editor-placeholder">
        <p>请从左侧目录树选择一个文件打开</p>
      </div>
    );
  }

  return (
    <div className="editor-wrapper">
      <div className="editor-tab">{filePath}</div>
      <div ref={containerRef} className="editor-container" />
    </div>
  );
}
