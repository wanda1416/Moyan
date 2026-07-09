import { invoke } from "@tauri-apps/api/core";

export function useLogger() {
  const log = (level: string, message: string) => {
    invoke("write_log", { level, message }).catch((err) => {
      console.error("写入日志失败:", err);
    });
  };

  return {
    info: (msg: string) => log("INFO", msg),
    warn: (msg: string) => log("WARN", msg),
    error: (msg: string) => log("ERROR", msg),
  };
}
