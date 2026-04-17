use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentConfig {
    pub auth_token: String,
}

pub fn load_config() -> Option<AgentConfig> {
    let config_path = Path::new("config.json");
    if !config_path.exists() {
        return None;
    }

    match fs::read_to_string(config_path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(config) => Some(config),
            Err(_) => None,
        },
        Err(_) => None,
    }
}

pub fn get_auth_token() -> String {
    // 1. Priorité au Registre Windows (si sur Windows et installé via MSI)
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(key) = hklm.open_subkey("SOFTWARE\\PC Games Local Agent") {
            if let Ok(token) = key.get_value::<String, &str>("AuthToken") {
                if !token.is_empty() && !token.contains("PLACEHOLDER_TOKEN") {
                    return token;
                }
            }
        }
    }

    // 2. Fichier de config local (développement ou portable)
    if let Some(config) = load_config() {
        return config.auth_token;
    }

    // 3. Fallback sur l'environnement
    std::env::var("AGENT_AUTH_TOKEN").unwrap_or_else(|_| "default_secret_token".to_string())
}
