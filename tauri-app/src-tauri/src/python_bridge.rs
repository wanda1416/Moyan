use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

/// 启动模式：开发态使用 venv 中的 Python，发布态使用 sidecar
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LaunchMode {
    /// 使用 agent-core/.venv 中的 python main.py
    Dev,
    /// 使用打包好的 sidecar 可执行文件
    Sidecar,
}

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
    mode: LaunchMode,
}

/// 全局 PID 存储（用于应用退出时清理）
static PYTHON_PID: AtomicU32 = AtomicU32::new(0);

impl PythonBridge {
    /// 创建 PythonBridge，指定启动模式（推荐入口）
    pub fn with_mode(config: PythonConfig, mode: LaunchMode) -> Self {
        Self { config, mode }
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

        match self.mode {
            LaunchMode::Dev => self.start_dev(),
            LaunchMode::Sidecar => self.start_sidecar(),
        }
    }

    /// 开发态：使用 venv 中的 python main.py
    fn start_dev(&self) -> Result<String, String> {
        let python_path = self.resolve_python_path();
        let agent_dir = self
            .find_agent_core_dir()
            .ok_or_else(|| "找不到 agent-core 目录，请确认项目结构完整".to_string())?;

        eprintln!("[PythonBridge] [dev] Python 路径: {}", &python_path);
        eprintln!("[PythonBridge] [dev] agent-core: {}", agent_dir.display());

        let child = std::process::Command::new(&python_path)
            .arg("main.py")
            .arg("--host")
            .arg(&self.config.host)
            .arg("--port")
            .arg(self.config.port.to_string())
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

    /// 发布态：使用打包好的 sidecar 可执行文件
    /// 通过 Tauri App handle 的 resource_dir 定位 sidecar 二进制
    /// stdout/stderr 捕获到 ~/.moyan/logs/sidecar.log，便于诊断崩溃
    fn start_sidecar(&self) -> Result<String, String> {
        // 通过全局 PYTHON_PID 判断是否已启动（避免重复启动）
        let existing_pid = PYTHON_PID.load(Ordering::SeqCst);
        if existing_pid > 0 && is_process_alive(existing_pid) {
            return Ok(format!("Python 进程已在运行 (PID: {})", existing_pid));
        }

        let sidecar_path = self
            .resolve_sidecar_path()
            .ok_or_else(|| "找不到 sidecar 可执行文件 (moyan-backend)".to_string())?;

        eprintln!("[PythonBridge] [sidecar] 路径: {}", sidecar_path.display());

        // ── 准备日志文件 ──
        let log_dir = dirs::home_dir()
            .map(|h| h.join(".moyan").join("logs"))
            .unwrap_or_else(|| std::path::PathBuf::from("."));
        let _ = std::fs::create_dir_all(&log_dir);
        let log_path = log_dir.join("sidecar.log");

        let log_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|e| format!("无法打开 sidecar 日志 {}: {}", log_path.display(), e))?;

        // 启动时间戳 + 诊断信息
        {
            let mut f = log_file.try_clone().map_err(|e| e.to_string())?;
            let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
            let _ = writeln!(f, "\n=== sidecar 启动 {} PID={:?} ===",
                ts, std::process::id());
            let _ = writeln!(f, "路径: {}", sidecar_path.display());

            // 诊断：文件大小
            if let Ok(meta) = std::fs::metadata(&sidecar_path) {
                let _ = writeln!(f, "文件大小: {} bytes", meta.len());
            }

            // 诊断：当前工作目录
            if let Ok(cwd) = std::env::current_dir() {
                let _ = writeln!(f, "工作目录: {}", cwd.display());
            }

            // 诊断：可能影响 PyInstaller 的环境变量
            for var in &["PYTHONHOME", "PYTHONPATH", "PYTHONNOUSERSITE",
                         "PYTHONDONTWRITEBYTECODE", "PYINSTALLER_CONFIG_DIR"] {
                match std::env::var(var) {
                    Ok(val) => { let _ = writeln!(f, "ENV {}={}", var, val); }
                    Err(_) => {}
                }
            }

            // 诊断：TEMP 目录
            if let Ok(tmp) = std::env::var("TEMP") {
                let _ = writeln!(f, "TEMP={}", tmp);
            }
        }

        // ── 启动 sidecar 进程（piped 模式） ──
        // 显式清除可能干扰 PyInstaller 的环境变量
        let mut cmd = std::process::Command::new(sidecar_path.as_os_str());
        cmd.env_remove("PYTHONHOME")
            .env_remove("PYTHONPATH")
            .env_remove("PYTHONNOUSERSITE")
            .env_remove("PYTHONDONTWRITEBYTECODE")
            .arg("--host")
            .arg(&self.config.host)
            .arg("--port")
            .arg(self.config.port.to_string())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        // Windows: 隐藏控制台窗口（CREATE_NO_WINDOW = 0x08000000）
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| {
                format!(
                    "启动 sidecar 失败 (路径: {}): {}",
                    sidecar_path.display(),
                    e
                )
            })?;

        let pid = child.id();
        PYTHON_PID.store(pid, Ordering::SeqCst);

        // ── stdout → 日志 ──
        if let Some(stdout) = child.stdout.take() {
            let mut log = log_file.try_clone().ok();
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().flatten() {
                    if let Some(ref mut f) = log {
                        let _ = writeln!(f, "[stdout] {}", line);
                        let _ = f.flush();
                    }
                }
            });
        }

        // ── stderr → 日志 ──
        if let Some(stderr) = child.stderr.take() {
            let mut log = log_file.try_clone().ok();
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
                    if let Some(ref mut f) = log {
                        let _ = writeln!(f, "[stderr] {}", line);
                        let _ = f.flush();
                    }
                }
            });
        }

        // ── 进程退出监控 ──
        let log_for_watcher = log_file.try_clone().ok();
        std::thread::spawn(move || {
            match child.wait() {
                Ok(status) => {
                    if let Some(mut f) = log_for_watcher {
                        let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
                        if status.success() {
                            let _ = writeln!(f, "=== sidecar 正常退出 {} (code=0) ===", ts);
                        } else {
                            let code = status.code().unwrap_or(-1);
                            let _ = writeln!(f, "=== sidecar 异常退出 {} (code={}) ===", ts, code);
                        }
                        let _ = f.flush();
                    }
                    PYTHON_PID.store(0, Ordering::SeqCst);
                }
                Err(e) => {
                    if let Some(mut f) = log_for_watcher {
                        let _ = writeln!(f, "[watcher] 等待进程退出失败: {}", e);
                        let _ = f.flush();
                    }
                    PYTHON_PID.store(0, Ordering::SeqCst);
                }
            }
        });

        eprintln!("[PythonBridge] [sidecar] 日志: {}", log_path.display());

        Ok(format!(
            "Sidecar 进程已启动 (PID: {})，等待后端就绪...",
            pid
        ))
    }

    /// 定位 sidecar 可执行文件路径
    /// 优先级：
    ///   1. 相对于当前可执行文件的同目录（含 target triple 后缀）
    ///   2. 资源目录的 binaries 子目录（Tauri sidecar 解析规则）
    fn resolve_sidecar_path(&self) -> Option<std::path::PathBuf> {
        let base_name = "moyan-backend";
        // 生成候选文件名：先查带 target triple 后缀的，再查不带后缀的
        let candidates: Vec<String> = if cfg!(target_os = "windows") {
            vec![
                format!("{}-x86_64-pc-windows-msvc.exe", base_name),
                format!("{}-aarch64-pc-windows-msvc.exe", base_name),
                format!("{}.exe", base_name),
            ]
        } else if cfg!(target_os = "macos") {
            vec![
                format!("{}-aarch64-apple-darwin", base_name),
                format!("{}-x86_64-apple-darwin", base_name),
                base_name.to_string(),
            ]
        } else {
            vec![
                format!("{}-x86_64-unknown-linux-gnu", base_name),
                format!("{}-aarch64-unknown-linux-gnu", base_name),
                base_name.to_string(),
            ]
        };

        // 1. 相对于当前可执行文件同目录
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                for name in &candidates {
                    let candidate = dir.join(name);
                    if candidate.exists() {
                        return Some(candidate);
                    }
                }
                // Tauri 把 sidecar 放在 resources/binaries/
                for name in &candidates {
                    let res = dir.join("resources").join("binaries").join(name);
                    if res.exists() {
                        return Some(res);
                    }
                }
            }
        }

        // 2. 当前工作目录下的 resources/binaries/
        if let Ok(cwd) = std::env::current_dir() {
            for name in &candidates {
                let res = cwd.join("resources").join("binaries").join(name);
                if res.exists() {
                    return Some(res);
                }
            }
            for name in &candidates {
                let cwd_direct = cwd.join(name);
                if cwd_direct.exists() {
                    return Some(cwd_direct);
                }
            }
        }

        None
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
        let (python_path, agent_core_path) = match self.mode {
            LaunchMode::Dev => (
                self.resolve_python_path(),
                self.find_agent_core_dir().map(|p| p.to_string_lossy().to_string()),
            ),
            LaunchMode::Sidecar => (
                self.resolve_sidecar_path()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| "sidecar: moyan-backend".to_string()),
                None,
            ),
        };
        PythonStatus {
            pid: if pid > 0 { Some(pid) } else { None },
            host: self.config.host.clone(),
            port: self.config.port,
            python_path,
            agent_core_path,
            mode: match self.mode {
                LaunchMode::Dev => "dev".to_string(),
                LaunchMode::Sidecar => "sidecar".to_string(),
            },
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
    /// 启动模式：dev | sidecar
    pub mode: String,
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
