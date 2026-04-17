# Rust Local Agent (Windows Daemon)

Lightweight Rust daemon for performing low-level Windows file system operations.

## Configuration

Set the `AGENT_AUTH_TOKEN` environment variable for security.

## API Examples

### 1. Mount ISO
**Endpoint:** `POST /mount_iso`
**Request:**
```json
{
  "iso_path": "C:\\Games\\MyGame.iso"
}
```
**Response:**
```json
{
  "drive_letter": "E:",
  "status": "mounted"
}
```

### 2. Connect NAS
**Endpoint:** `POST /mount_nas`
**Request:**
```json
{
  "share_path": "\\\\NAS\\Games",
  "username": "admin",
  "password": "secret_password"
}
```

### 3. Create Workspace (Symlinks)
**Endpoint:** `POST /create_workspace`
**Request:**
```json
{
  "vault_path": "V:\\Games\\Vault",
  "workspace_path": "C:\\Games\\Workspace"
}
```

### 4. Status
**Endpoint:** `GET /status`

## Build and Installation

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) (Stable)
- [WiX Toolset v6.0](https://wixtoolset.org/releases/)

### Building the MSI Installer
To build the agent and generate the MSI installer, run the following command from the project root:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\rust_agent\build_msi.ps1
```

Or from within the `rust_agent/` directory:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\build_msi.ps1
```

### MSI Features
- **Binary Substitution:** The installer supports binary token substitution during download via the backend.
- **Auto-start:** The agent can be configured to start automatically with Windows.
- **System Tray:** Includes a system tray icon for monitoring logs and managing the service.

