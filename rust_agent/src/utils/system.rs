use std::path::{Path, PathBuf};
use winreg::enums::*;
use winreg::RegKey;
use directories::ProjectDirs;

pub fn get_log_dir() -> PathBuf {
    if let Some(proj_dirs) = ProjectDirs::from("be", "sigoli", "PCGamesLocalAgent") {
        let path = proj_dirs.data_local_dir();
        let _ = std::fs::create_dir_all(path);
        return path.to_path_buf();
    }
    PathBuf::from(".")
}

pub fn show_live_logs() -> anyhow::Result<()> {
    let log_path = get_log_dir().join("agent.log");
    let log_str = log_path.to_str().unwrap_or_default();
    
    // Launch powershell to tail the log file
    // We use 'cmd /c start' which is the standard Windows way to launch a TRULY independent process
    #[cfg(windows)]
    {
        let ps_command = format!(
            "chcp 65001; Write-Host '--- Logs en direct de l Agent Local ---' -ForegroundColor Cyan; if (Test-Path '{}') {{ Get-Content -Path '{}' -Wait -Tail 100 }} else {{ Write-Error 'Fichier de log introuvable.' }}", 
            log_str, log_str
        );

        // Use creation_flags to hide the cmd flash
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        std::process::Command::new("cmd.exe")
            .args(&[
                "/c", 
                "start", 
                "powershell.exe", 
                "-NoExit", 
                "-Command", 
                &ps_command
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()?;
    }
    
    Ok(())
}

pub fn get_install_dir() -> Option<String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey("SOFTWARE\\PC Games Local Agent") {
        return key.get_value::<String, &str>("InstallDir").ok();
    }
    None
}

pub fn is_autostart_enabled() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run") {
        return key.get_value::<String, &str>("PC Games Local Agent").is_ok();
    }
    false
}

pub fn set_autostart(enabled: bool) -> anyhow::Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey_with_flags("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_WRITE | KEY_READ)?;
    
    if enabled {
        let exe_path = std::env::current_exe()?;
        key.set_value("PC Games Local Agent", &exe_path.to_str().unwrap_or_default())?;
    } else {
        let _ = key.delete_value("PC Games Local Agent");
    }
    Ok(())
}

pub fn open_config_file() -> anyhow::Result<()> {
    let install_dir = get_install_dir().unwrap_or_else(|| ".".to_string());
    let config_path = Path::new(&install_dir).join("config.json");
    if config_path.exists() {
        open::that(config_path)?;
    } else {
        // Create default if missing
        std::fs::write(&config_path, "{\n  \"auth_token\": \"your_token_here\"\n}")?;
        open::that(config_path)?;
    }
    Ok(())
}

pub fn open_registry_editor() -> anyhow::Result<()> {
    // Open regedit at the specific key
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.create_subkey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit") {
        key.0.set_value("LastKey", &"HKEY_LOCAL_MACHINE\\SOFTWARE\\PC Games Local Agent")?;
    }
    
    std::process::Command::new("regedit.exe").spawn()?;
    Ok(())
}
