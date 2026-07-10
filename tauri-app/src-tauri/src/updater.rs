use serde::{Deserialize, Serialize};

/// 当前应用版本（从 Cargo.toml 读取）
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// GitHub 仓库信息（由 build.rs 从 git remote 解析后注入）
/// 支持通过环境变量 `MOYAN_GITHUB_OWNER` / `MOYAN_GITHUB_REPO` 覆盖（用于 fork）
/// 解析失败时为 "unknown"，check_for_update 会直接报错，不发起请求
const GITHUB_OWNER: &str = env!("GITHUB_OWNER");
const GITHUB_REPO: &str = env!("GITHUB_REPO");

/// 检查 GitHub 仓库信息是否已正确配置
fn is_repo_configured() -> bool {
    !GITHUB_OWNER.is_empty()
        && GITHUB_OWNER != "unknown"
        && !GITHUB_REPO.is_empty()
        && GITHUB_REPO != "unknown"
}

/// 更新检查结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    /// 是否有可用更新
    pub has_update: bool,
    /// 当前版本
    pub current_version: String,
    /// 最新版本
    pub latest_version: String,
    /// 发布页面 URL
    pub release_url: String,
    /// Release notes (markdown)
    pub release_notes: String,
    /// 发布时间（ISO 8601）
    pub published_at: String,
}

/// GitHub Release API 响应（只解析需要的字段）
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

/// 检查 GitHub Releases 是否有新版本
pub async fn check_for_update() -> Result<UpdateInfo, String> {
    if !is_repo_configured() {
        return Err("GitHub 仓库未配置（owner/repo 为 unknown），跳过更新检查".to_string());
    }

    let url = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        GITHUB_OWNER, GITHUB_REPO
    );

    let client = reqwest::Client::builder()
        .user_agent("Moyan-Desktop-Updater")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;

    let release: GitHubRelease = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求 GitHub API 失败: {}", e))?
        .error_for_status()
        .map_err(|e| format!("GitHub API 返回错误: {}", e))?
        .json()
        .await
        .map_err(|e| format!("解析 GitHub API 响应失败: {}", e))?;

    // 跳过 draft / prerelease
    if release.draft || release.prerelease {
        return Ok(UpdateInfo {
            has_update: false,
            current_version: APP_VERSION.to_string(),
            latest_version: release.tag_name.trim_start_matches('v').to_string(),
            release_url: release.html_url,
            release_notes: release.body.unwrap_or_default(),
            published_at: release.published_at.unwrap_or_default(),
        });
    }

    let latest = release.tag_name.trim_start_matches('v').to_string();
    let has_update = compare_versions(&latest, APP_VERSION) == std::cmp::Ordering::Greater;

    Ok(UpdateInfo {
        has_update,
        current_version: APP_VERSION.to_string(),
        latest_version: latest,
        release_url: release.html_url,
        release_notes: release.body.unwrap_or_default(),
        published_at: release.published_at.unwrap_or_default(),
    })
}

/// 简单 SemVer 比较（仅处理 x.y.z 形式，不处理 prerelease / build metadata）
fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |s: &str| -> Vec<u32> {
        s.split('.')
            .filter_map(|seg| seg.split('-').next().unwrap_or("0").parse::<u32>().ok())
            .collect()
    };
    let va = parse(a);
    let vb = parse(b);
    va.cmp(&vb)
}

/// Tauri 命令：检查更新
#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    check_for_update().await
}

/// Tauri 命令：获取当前版本
#[tauri::command]
pub fn app_version() -> String {
    APP_VERSION.to_string()
}
