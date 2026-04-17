use axum::{
    extract::Request,
    middleware::Next,
    response::Response,
    http::Method,
};
use crate::utils::errors::AgentError;
use crate::utils::helpers::get_auth_token;

pub mod handlers;
pub mod router;

pub async fn auth_middleware(
    req: Request,
    next: Next,
) -> Result<Response, AgentError> {
    let method = req.method().clone();
    let path = req.uri().path().to_string();

    // Bypass auth for CORS preflight (OPTIONS)
    if method == Method::OPTIONS {
        return Ok(next.run(req).await);
    }

    let auth_header = req.headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok());

    let token = get_auth_token();
    let expected = format!("Bearer {}", token);

    if let Some(auth) = auth_header {
        if auth == expected {
            tracing::info!("🔓 [AUTH] Success: {} {}", method, path);
            return Ok(next.run(req).await);
        }
    }

    tracing::warn!("🔒 [AUTH] Failed: {} {}", method, path);
    Err(AgentError::Unauthorized)
}
