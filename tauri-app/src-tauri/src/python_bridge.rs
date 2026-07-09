#![allow(dead_code)]

use serde::{Deserialize, Serialize};

/// Python 进程配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythonConfig {
    pub host: String,
    pub port: u16,
    pub venv_path: Option<String>,
}

impl Default for PythonConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 8765,
            venv_path: None,
        }
    }
}

/// Python 进程管理器
/// TODO: 实现 Python 进程的启动、健康检查、关闭
pub struct PythonBridge {
    config: PythonConfig,
    // child: Option<std::process::Child>,
}

impl PythonBridge {
    pub fn new(config: PythonConfig) -> Self {
        Self { config }
    }

    /// 启动 Python Agent 进程
    pub fn start(&mut self) -> Result<(), String> {
        // TODO: 启动 Python 子进程
        // let python_path = self.config.venv_path
        //     .map(|v| format!("{}/bin/python", v))
        //     .unwrap_or_else(|| "python".to_string());
        //
        // let child = std::process::Command::new(&python_path)
        //     .arg("main.py")
        //     .current_dir("../agent-core")
        //     .spawn()
        //     .map_err(|e| e.to_string())?;
        //
        // self.child = Some(child);
        Ok(())
    }

    /// 检查 Python 服务是否存活
    pub fn health_check(&self) -> bool {
        // TODO: 发送 HTTP 健康检查请求
        false
    }

    /// 关闭 Python 进程
    pub fn stop(&mut self) -> Result<(), String> {
        // TODO: 优雅关闭子进程
        Ok(())
    }
}
