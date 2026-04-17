use std::fs;
use std::path::Path;
use std::os::windows::fs as windows_fs;
use std::time::{Duration, SystemTime};
use crate::utils::errors::{AgentError, AgentResult};

pub fn create_symlinks(vault_path: &str, workspace_path: &str) -> AgentResult<()> {
    let vault = Path::new(vault_path);
    let workspace = Path::new(workspace_path);

    if !vault.exists() {
        return Err(AgentError::NotFound(format!("Vault path not found: {}", vault_path)));
    }

    if !workspace.exists() {
        fs::create_dir_all(workspace)?;
    }

    // Recursively create symlinks for all files in the vault
    for entry in fs::read_dir(vault)? {
        let entry = entry?;
        let path = entry.path();
        let name = path.file_name().ok_or_else(|| AgentError::Internal("Invalid file name".to_string()))?;
        let target = workspace.join(name);

        if target.exists() {
            if target.is_dir() {
                fs::remove_dir_all(&target)?;
            } else {
                fs::remove_file(&target)?;
            }
        }

        if path.is_dir() {
            windows_fs::symlink_dir(&path, &target)?;
        } else {
            windows_fs::symlink_file(&path, &target)?;
        }
    }

    Ok(())
}

pub fn cleanup_workspace(workspace_path: &str) -> AgentResult<()> {
    let workspace = Path::new(workspace_path);
    if workspace.exists() {
        fs::remove_dir_all(workspace)?;
    }
    Ok(())
}

/// Scans the base workspace directory and removes any game workspaces older than the specified TTL.
pub fn auto_cleanup_workspaces(base_workspace_path: &str, ttl: Duration) -> AgentResult<usize> {
    let base_path = Path::new(base_workspace_path);
    if !base_path.exists() {
        return Ok(0);
    }

    let mut removed_count = 0;
    let now = SystemTime::now();

    for entry in fs::read_dir(base_path)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let metadata = fs::metadata(&path)?;
            let modified = metadata.modified()?;
            
            if let Ok(elapsed) = now.duration_since(modified) {
                if elapsed > ttl {
                    tracing::info!("Auto-cleaning expired workspace: {:?}", path);
                    fs::remove_dir_all(&path)?;
                    removed_count += 1;
                }
            }
        }
    }

    Ok(removed_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_symlinks_invalid_vault() {
        let result = create_symlinks("Z:\\non_existent_vault", "C:\\temp_workspace");
        assert!(result.is_err());
    }
}
