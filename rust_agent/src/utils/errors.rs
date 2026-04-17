use thiserror::Error;
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Error, Debug)]
pub enum AgentError {
    #[error("Internal server error: {0}")]
    Internal(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("PowerShell error: {0}")]
    PowerShell(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Invalid request: {0}")]
    BadRequest(String),

    #[error("Authentication failed")]
    Unauthorized,
}

impl IntoResponse for AgentError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AgentError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            AgentError::NotFound(_) => (StatusCode::NOT_FOUND, self.to_string()),
            AgentError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AgentError::PermissionDenied(_) => (StatusCode::FORBIDDEN, self.to_string()),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };

        let body = Json(json!({
            "status": "error",
            "message": error_message,
        }));

        (status, body).into_response()
    }
}

pub type AgentResult<T> = Result<T, AgentError>;
