import { useState } from "react";
import FileTree from "./components/FileTree";
import Editor from "./components/Editor";
import AgentPanel from "./components/AgentPanel";
import "./styles.css";

function App() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");

  return (
    <div className="app-container">
      <aside className="sidebar">
        <FileTree onFileSelect={setCurrentFile} />
      </aside>
      <main className="editor-area">
        <Editor filePath={currentFile} content={fileContent} onChange={setFileContent} />
      </main>
      <aside className="agent-panel">
        <AgentPanel currentFile={currentFile} />
      </aside>
    </div>
  );
}

export default App;
