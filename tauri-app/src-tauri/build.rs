use std::process::Command;

fn main() {
    tauri_build::build();

    // 从当前 git 远端解析 GitHub owner / repo，作为编译期常量注入 updater.rs
    inject_github_remote();
}

/// 读取 `git remote get-url origin`，从中解析 GitHub 仓库的 owner 和 repo
/// 支持的 URL 形式：
///   - git@github.com:owner/repo.git
///   - https://github.com/owner/repo.git
///   - https://github.com/owner/repo
/// 解析失败时给出占位常量 "unknown"，调用方需检查并优雅降级
fn inject_github_remote() {
    // 让 build.rs 在远端变化时重新执行
    println!("cargo:rerun-if-changed=../.git/config");
    println!("cargo:rerun-if-env-changed=MOYAN_GITHUB_OWNER");
    println!("cargo:rerun-if-env-changed=MOYAN_GITHUB_REPO");

    // 1) 优先用环境变量覆盖（用于 fork 或私有仓库）
    if let (Ok(owner), Ok(repo)) = (
        std::env::var("MOYAN_GITHUB_OWNER"),
        std::env::var("MOYAN_GITHUB_REPO"),
    ) {
        if !owner.is_empty() && !repo.is_empty() {
            println!("cargo:rustc-env=GITHUB_OWNER={}", owner);
            println!("cargo:rustc-env=GITHUB_REPO={}", repo);
            return;
        }
    }

    // 2) 否则从 git 远端解析
    let url = read_git_remote_url().unwrap_or_default();
    let (owner, repo) = parse_github_remote(&url);

    println!("cargo:rustc-env=GITHUB_OWNER={}", owner);
    println!("cargo:rustc-env=GITHUB_REPO={}", repo);
}

fn read_git_remote_url() -> Option<String> {
    // 先尝试 `git remote get-url origin`
    if let Ok(out) = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .output()
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
    }
    // 回退到 `git config --get remote.origin.url`
    if let Ok(out) = Command::new("git")
        .args(["config", "--get", "remote.origin.url"])
        .output()
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
    }
    None
}

/// 从 GitHub 仓库 URL 中提取 (owner, repo)
fn parse_github_remote(url: &str) -> (String, String) {
    if url.is_empty() {
        return ("unknown".to_string(), "unknown".to_string());
    }
    // 去掉 .git 后缀
    let trimmed = url.trim_end_matches('/').trim_end_matches(".git");

    // SSH 形式：git@github.com:owner/repo
    let after_colon = trimmed.rsplit(':').next().unwrap_or("");
    let path = if trimmed.starts_with("git@") {
        after_colon
    } else if let Some(idx) = trimmed.find("://") {
        // HTTPS 形式：https://github.com/owner/repo → 去掉 scheme + host
        let rest = &trimmed[idx + 3..];
        // rest = "github.com/owner/repo"
        rest.splitn(2, '/').nth(1).unwrap_or(rest)
    } else {
        // 相对路径形式：github.com/owner/repo
        trimmed.splitn(2, '/').nth(1).unwrap_or(trimmed)
    };

    let mut parts = path.splitn(2, '/');
    let owner = parts.next().unwrap_or("unknown").to_string();
    let repo = parts.next().unwrap_or("unknown").to_string();
    (owner, repo)
}
