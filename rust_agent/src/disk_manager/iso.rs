use std::process::Command;
use std::path::Path;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use crate::utils::errors::{AgentError, AgentResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct MountResponse {
    pub drive_letter: String,
    pub status: String,
}

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn mount_iso(iso_path: &str) -> AgentResult<MountResponse> {
    if !Path::new(iso_path).exists() {
        return Err(AgentError::NotFound(format!("ISO file not found: {}", iso_path)));
    }

    // PowerShell command to mount ISO and get the drive letter
    let script = format!(
        "Mount-DiskImage -ImagePath \"{}\" -PassThru | Get-Volume | Select-Object -ExpandProperty DriveLetter",
        iso_path
    );

    let mut cmd = Command::new("powershell");
    cmd.args(["-Command", &script]);
    
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AgentError::PowerShell(err));
    }

    let drive_letter = String::from_utf8_lossy(&output.stdout).trim().to_string();
    
    if drive_letter.is_empty() {
        return Err(AgentError::PowerShell("ISO mounted but drive letter could not be determined".to_string()));
    }

    Ok(MountResponse {
        drive_letter: format!("{}:", drive_letter),
        status: "mounted".to_string(),
    })
}

pub fn unmount_iso(iso_path: &str) -> AgentResult<()> {
    let script = format!("Dismount-DiskImage -ImagePath \"{}\"", iso_path);

    let mut cmd = Command::new("powershell");
    cmd.args(["-Command", &script]);
    
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AgentError::PowerShell(err));
    }

    Ok(())
}

pub fn is_iso_mounted(iso_path: &str) -> AgentResult<bool> {
    // On vérifie si l'image est "Attached"
    let script = format!("(Get-DiskImage -ImagePath \"{}\").Attached", iso_path);

    let mut cmd = Command::new("powershell");
    cmd.args(["-Command", &script]);
    
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()?;

    if !output.status.success() {
        return Ok(false);
    }

    let result = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
    Ok(result == "true")
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require PowerShell and valid ISO files to run.
    // They are intended for local development environments.

    #[test]
    fn test_mount_non_existent_iso() {
        let result = mount_iso("C:\\non_existent.iso");
        assert!(result.is_err());
    }
}
