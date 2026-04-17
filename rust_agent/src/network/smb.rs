use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use crate::utils::errors::{AgentError, AgentResult};

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn mount_nas(share_path: &str, username: Option<&str>, password: Option<&str>) -> AgentResult<()> {
    // net use \\server\share /user:username password
    let mut args = vec!["use", share_path];
    
    let user_arg;
    if let (Some(u), Some(p)) = (username, password) {
        user_arg = format!("/user:{}", u);
        args.push(&user_arg);
        args.push(p);
    }

    let mut cmd = Command::new("net");
    cmd.args(&args);
    
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AgentError::Network(err));
    }

    Ok(())
}

pub fn unmount_nas(share_path: &str) -> AgentResult<()> {
    let mut cmd = Command::new("net");
    cmd.args(["use", share_path, "/delete", "/yes"]);
    
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AgentError::Network(err));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mount_invalid_nas() {
        let result = mount_nas("\\\\non_existent\\share", None, None);
        assert!(result.is_err());
    }
}
