use axum::{Json};
use serde::{Deserialize, Serialize};
use crate::utils::errors::AgentResult;
use crate::disk_manager::iso;
use crate::disk_manager::workspace;
use crate::network::smb;

#[derive(Deserialize)]
pub struct IsoRequest {
    pub iso_path: String,
}

#[derive(Deserialize)]
pub struct NasRequest {
    pub share_path: String,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Deserialize)]
pub struct WorkspaceRequest {
    pub vault_path: String,
    pub workspace_path: String,
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub status: String,
    pub version: String,
}

pub async fn mount_iso_handler(Json(payload): Json<IsoRequest>) -> AgentResult<Json<iso::MountResponse>> {
    tracing::info!("💿 Request: Mount ISO -> {}", payload.iso_path);
    match iso::mount_iso(&payload.iso_path) {
        Ok(res) => {
            tracing::info!("✅ Mount Success: Drive {}", res.drive_letter);
            Ok(Json(res))
        },
        Err(e) => {
            tracing::error!("❌ Mount Error: {}", e);
            Err(e)
        }
    }
}

pub async fn unmount_iso_handler(Json(payload): Json<IsoRequest>) -> AgentResult<Json<serde_json::Value>> {
    tracing::info!("⏏️ Request: Unmount ISO -> {}", payload.iso_path);
    match iso::unmount_iso(&payload.iso_path) {
        Ok(_) => {
            tracing::info!("✅ Unmount Success");
            Ok(Json(serde_json::json!({"status": "unmounted"})))
        },
        Err(e) => {
            tracing::error!("❌ Unmount Error: {}", e);
            Err(e)
        }
    }
}

pub async fn check_mount_handler(Json(payload): Json<IsoRequest>) -> AgentResult<Json<serde_json::Value>> {
    let attached = iso::is_iso_mounted(&payload.iso_path)?;
    tracing::debug!("🔍 Check Mount: {} -> {}", payload.iso_path, attached);
    Ok(Json(serde_json::json!({"attached": attached})))
}

pub async fn mount_nas_handler(Json(payload): Json<NasRequest>) -> AgentResult<Json<serde_json::Value>> {
    tracing::info!("🌐 Request: Mount NAS -> {}", payload.share_path);
    smb::mount_nas(&payload.share_path, payload.username.as_deref(), payload.password.as_deref())?;
    Ok(Json(serde_json::json!({"status": "connected"})))
}

pub async fn create_workspace_handler(Json(payload): Json<WorkspaceRequest>) -> AgentResult<Json<serde_json::Value>> {
    tracing::info!("📂 Request: Create Workspace -> {}", payload.workspace_path);
    workspace::create_symlinks(&payload.vault_path, &payload.workspace_path)?;
    Ok(Json(serde_json::json!({"status": "created"})))
}

pub async fn status_handler() -> Json<StatusResponse> {
    Json(StatusResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}
