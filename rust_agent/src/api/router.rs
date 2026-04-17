use axum::{
    routing::{get, post},
    Router,
    middleware,
};
use tower_http::trace::TraceLayer;
use crate::api::handlers;
use crate::api::auth_middleware;

pub fn create_router() -> Router {
    let api_routes = Router::new()
        .route("/mount_iso", post(handlers::mount_iso_handler))
        .route("/unmount_iso", post(handlers::unmount_iso_handler))
        .route("/check_mount", post(handlers::check_mount_handler))
        .route("/mount_nas", post(handlers::mount_nas_handler))
        .route("/create_workspace", post(handlers::create_workspace_handler))
        .layer(middleware::from_fn(auth_middleware));

    Router::new()
        .merge(api_routes)
        .route("/status", get(handlers::status_handler))
        .layer(TraceLayer::new_for_http())
}
