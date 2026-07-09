use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

/// Python 进程配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythonConfig {
    pub host: String,
    pub port: u16,
    pub venv_path: Option<String>,
    pub agent_core_path: Option<String>,
}

impl Default for PythonConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 8765,
            venv_path: None,
            agent_core_path: None,
        }
    }
}

/// Python 进程管理器
pub struct PythonBridge {
    config: PythonConfig,
}

/// 全局 PID 存储（用于应用退出时清理）
static PYTHON_PID: AtomicU32 = AtomicU32::new(0);

impl PythonBridge {
    pub fn new(config: PythonConfig) -> Self {
        Self { config }
    }

    /// 定位 Python 解释器路径
    /// 优先级: 自定义 venv_path → 相对路径 venv → 系统 python
    fn resolve_python_path(&self) -> String {
        // 1. 自定义 venv 路径
        if let Some(ref venv) = self.config.venv_path {
            let python = if cfg!(target_os = "windows") {
                format!("{}\\Scripts\\python.exe", venv)
            } else {
                format!("{}/bin/python", venv)
            };
            if std::path::Path::new(&python).exists() {
                return python;
            }
        }

        // 2. 相对路径查找 venv
        if let Some(agent_dir) = self.find_agent_core_dir() {
            let venv_python = if cfg!(target_os = "windows") {
                agent_dir.join(".venv\\Scripts\\python.exe")
            } else {
                agent_dir.join(".venv/bin/python")
            };
            if venv_python.exists() {
                return venv_python.to_string_lossy().to_string();
            }
        }

        // 3. 回退到系统 python
        "python".to_string()
    }

    /// 定位 agent-core 目录
    fn find_agent_core_dir(&self) -> Option<std::path::PathBuf> {
        // 1. 自定义路径
        if let Some(ref path) = self.config.agent_core_path {
            let p = std::path::Path::new(path);
            if p.exists() && p.join("main.py").exists() {
                return Some(p.to_path_buf());
            }
        }

        // 2. 从可执行文件位置向上查找（同时检查兄弟目录）
        if let Ok(exe) = std::env::current_exe() {
            let mut dir = exe.parent();
            while let Some(d) = dir {
                // 检查当前目录下的 agent-core 子目录
                let child = d.join("agent-core");
                if child.exists() && child.join("main.py").exists() {
                    return Some(child);
                }
                // 检查兄弟目录（处理 tauri-app/ 与 agent-core/ 平级）
                if let Some(parent) = d.parent() {
                    let sibling = parent.join("agent-core");
                    if sibling.exists() && sibling.join("main.py").exists() {
                        return Some(sibling);
                    }
                }
                dir = d.parent();
            }
        }

        // 3. 从当前工作目录查找
        if let Ok(cwd) = std::env::current_dir() {
            let child = cwd.join("agent-core");
            if child.exists() && child.join("main.py").exists() {
                return Some(child);
            }
            // 也检查 cwd 的兄弟目录
            if let Some(parent) = cwd.parent() {
                let sibling = parent.join("agent-core");
                if sibling.exists() && sibling.join("main.py").exists() {
                    return Some(sibling);
                }
            }
        }

        None
    }

    /// 启动 Python Agent 进程（仅 spawn，不等待就绪）
    pub fn start(&self) -> Result<String, String> {
        // 检查端口是否已被占用
        self.check_port_available()?;

        let python_path = self.resolve_python_path();
        let agent_dir = self
            .find_agent_core_dir()
            .ok_or_else(|| "找不到 agent-core 目录，请确认项目结构完整".to_string())?;

        eprintln!("[PythonBridge] Python 路径: {}", &python_path);
        eprintln!("[PythonBridge] agent-core: {}", agent_dir.display());

        let child = std::process::Command::new(&python_path)
            .arg("main.py")
            .current_dir(&agent_dir)
            .stdin(std::process::Stdio::null())
            // stdout/stderr 继承父进程，直接输出到控制台
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|e| {
                format!("启动 Python 失败 (路径: {}): {}", python_path, e)
            })?;

        let pid = child.id();
        PYTHON_PID.store(pid, Ordering::SeqCst);

        Ok(format!(
            "Python 进程已启动 (PID: {})，等待后端就绪...", pid
        ))
    }

    /// 启动并等待就绪（阻塞式，用于 setup 阶段的后台线程）
    pub fn start_and_wait(&self) -> Result<String, String> {
        let msg = self.start()?;
        if msg.contains("已在运行") {
            return Ok(msg);
        }

        // 等待后端就绪（最多 15 秒）
        for _ in 0..15 {
            std::thread::sleep(std::time::Duration::from_secs(1));
            if self.health_check_sync() {
                let pid = PYTHON_PID.load(Ordering::SeqCst);
                return Ok(format!(
                    "Python 后端已就绪 (PID: {}, 地址: {}:{})",
                    pid, self.config.host, self.config.port
                ));
            }
        }

        let pid = PYTHON_PID.load(Ordering::SeqCst);
        Ok(format!(
            "Python 进程已启动 (PID: {})，但后端尚未就绪，请稍后重试",
            pid
        ))
    }

    /// 同步健康检查（用于启动等待阶段）
    fn health_check_sync(&self) -> bool {
        let url = format!(
            "http://{}:{}/health",
            self.config.host, self.config.port
        );
        // 用短超时的 blocking client 做探测
        match reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .build()
        {
            Ok(client) => match client.get(&url).send() {
                Ok(resp) => resp.status().is_success(),
                Err(_) => false,
            },
            Err(_) => false,
        }
    }

    /// 检查端口是否可用，若被占用则报错并提示 PID
    fn check_port_available(&self) -> Result<(), String> {
        // 先检查已记录的 PID
        let old_pid = PYTHON_PID.load(Ordering::SeqCst);
        if old_pid > 0 && is_process_alive(old_pid) {
            return Err(format!(
                "端口 {} 已被占用 (PID: {})，请先关闭占用的进程或终止上一次的进程",
                self.config.port, old_pid
            ));
        }

        // 通过系统命令查找占用端口的进程
        #[cfg(target_os = "windows")]
        {
            if let Ok(output) = std::process::Command::new("powershell")
                .args([
                    "-NoProfile", "-Command",
                    &format!(
                        "Get-NetTCPConnection -LocalPort {} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique",
                        self.config.port
                    ),
                ])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if let Ok(pid) = line.trim().parse::<u32>() {
                        if pid > 0 {
                            return Err(format!(
                                "端口 {} 已被进程 PID {} 占用，请先关闭该进程后再启动",
                                self.config.port, pid
                            ));
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// 检查 Python 服务是否存活（供前端命令调用）
    pub async fn health_check_async(&self) -> bool {
        let url = format!(
            "http://{}:{}/health",
            self.config.host, self.config.port
        );
        match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
        {
            Ok(client) => match client.get(&url).send().await {
                Ok(resp) => resp.status().is_success(),
                Err(_) => false,
            },
            Err(_) => false,
        }
    }

    /// 关闭 Python 进程
    pub fn stop(&self) -> Result<String, String> {
        let pid = PYTHON_PID.load(Ordering::SeqCst);
        if pid == 0 {
            return Ok("Python 后端未在运行".to_string());
        }

        kill_process(pid)?;
        PYTHON_PID.store(0, Ordering::SeqCst);
        Ok(format!("Python 后端已关闭 (PID: {})", pid))
    }

    /// 获取连接参数（host, port）的克隆，用于在不持锁时做异步操作
    pub fn connection_params(&self) -> (String, u16) {
        (self.config.host.clone(), self.config.port)
    }

    /// 获取当前状态信息
    pub fn get_status(&self) -> PythonStatus {
        let pid = PYTHON_PID.load(Ordering::SeqCst);
        PythonStatus {
            pid: if pid > 0 { Some(pid) } else { None },
            host: self.config.host.clone(),
            port: self.config.port,
            python_path: self.resolve_python_path(),
            agent_core_path: self
                .find_agent_core_dir()
                .map(|p| p.to_string_lossy().to_string()),
        }
    }
}

/// 终止指定 PID 的进程及其子进程
fn kill_process(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // /T = 杀进程树，/F = 强制终止
        std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
            .map_err(|e| format!("taskkill 失败: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        // 杀进程组
        let _ = std::process::Command::new("pkill")
            .args(["-P", &pid.to_string()])
            .output();
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }

    Ok(())
}

/// 检查进程是否存活
fn is_process_alive(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/NH"])
            .output()
            .map(|o| {
                let stdout = String::from_utf8_lossy(&o.stdout);
                stdout.contains(&pid.to_string())
            })
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "windows"))]
    {
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
}

/// Python 后端状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythonStatus {
    pub pid: Option<u32>,
    pub host: String,
    pub port: u16,
    pub python_path: String,
    pub agent_core_path: Option<String>,
}

// ─── Tauri 命令 ────────────────────────────────────────────

#[tauri::command]
pub async fn start_python(
    bridge: tauri::State<'_, Mutex<PythonBridge>>,
) -> Result<String, String> {
    let b = bridge.lock().map_err(|e| e.to_string())?;
    b.start()
}

#[tauri::command]
pub async fn stop_python(
    bridge: tauri::State<'_, Mutex<PythonBridge>>,
) -> Result<String, String> {
    let bridge = bridge.lock().map_err(|e| e.to_string())?;
    bridge.stop()
}

#[tauri::command]
pub async fn python_health_check(
    bridge: tauri::State<'_, Mutex<PythonBridge>>,
) -> Result<bool, String> {
    let (host, port) = {
        let b = bridge.lock().map_err(|e| e.to_string())?;
        b.connection_params()
    };
    let url = format!("http://{}:{}/health", host, port);
    match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
    {
        Ok(client) => match client.get(&url).send().await {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        },
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn python_status(
    bridge: tauri::State<'_, Mutex<PythonBridge>>,
) -> Result<PythonStatus, String> {
    let bridge = bridge.lock().map_err(|e| e.to_string())?;
    Ok(bridge.get_status())
}

/// 应用退出时调用，清理 Python 进程
pub fn shutdown_python() {
    let pid = PYTHON_PID.load(Ordering::SeqCst);
    if pid > 0 {
        let _ = kill_process(pid);
        PYTHON_PID.store(0, Ordering::SeqCst);
    }
}
