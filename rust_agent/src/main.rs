#![windows_subsystem = "windows"]

mod api;
mod disk_manager;
mod network;
mod utils;

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use tower_http::cors::{Any, CorsLayer};
use axum::http::Method;
use tray_icon::{
    menu::{Menu, MenuEvent, MenuItem, CheckMenuItem, PredefinedMenuItem},
    TrayIconBuilder, Icon, TrayIconEvent,
};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use crate::utils::system::{is_autostart_enabled, set_autostart, open_config_file, open_registry_editor, get_log_dir, show_live_logs};

struct AppState {
    listening: bool,
    server_abort: Option<tokio::sync::oneshot::Sender<()>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Initialize logging
    let log_dir = get_log_dir();
    let file_appender = tracing_appender::rolling::never(log_dir, "agent.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "rust_local_agent=info,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer().with_writer(non_blocking))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Rust Local Agent v{} starting up...", env!("CARGO_PKG_VERSION"));

    let icon = load_icon();

    // 2. Menu Setup
    let tray_menu = Menu::new();
    let item_logs = MenuItem::new("Voir les logs en direct", true, None);
    let item_config = MenuItem::new("Ouvrir le fichier de configuration", true, None);
    let item_regedit = MenuItem::new("Ouvrir la base de registre (Admin)", true, None);
    let item_autostart = CheckMenuItem::new("Lancer au démarrage de Windows", true, is_autostart_enabled(), None);
    let item_listen = CheckMenuItem::new("Écouter le port 8080", true, true, None);
    let item_exit = MenuItem::new("Quitter", true, None);

    tray_menu.append_items(&[
        &item_logs,
        &PredefinedMenuItem::separator(),
        &item_config,
        &item_regedit,
        &PredefinedMenuItem::separator(),
        &item_autostart,
        &item_listen,
        &PredefinedMenuItem::separator(),
        &item_exit,
    ])?;

    let _tray_icon = TrayIconBuilder::new()
        .with_menu(Box::new(tray_menu.clone()))
        .with_tooltip("PC Games Local Agent")
        .with_icon(icon)
        .build()?;

    // 3. Server Management State
    let state = Arc::new(Mutex::new(AppState {
        listening: true,
        server_abort: None,
    }));

    // Start initial server
    start_or_stop_server(Arc::clone(&state));

    // 4. Event Loop (System Tray UI & Events)
    let event_loop = EventLoopBuilder::new().build();
    let menu_channel = MenuEvent::receiver();
    let tray_channel = TrayIconEvent::receiver();

    event_loop.run(move |_event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        // Important: Drain tray events to prevent freezing on click
        while let Ok(_event) = tray_channel.try_recv() {
            // We don't need to do anything specific on click, 
            // but consuming the event prevents the "hang".
        }

        if let Ok(event) = menu_channel.try_recv() {
            if event.id() == item_exit.id() {
                *control_flow = ControlFlow::Exit;
            } else if event.id() == item_logs.id() {
                let _ = show_live_logs();
            } else if event.id() == item_config.id() {
                let _ = open_config_file();
            } else if event.id() == item_regedit.id() {
                let _ = open_registry_editor();
            } else if event.id() == item_autostart.id() {
                let _ = set_autostart(item_autostart.is_checked());
            } else if event.id() == item_listen.id() {
                let mut s = state.lock().unwrap();
                s.listening = item_listen.is_checked();
                tracing::info!("👂 Port 8080 listening toggled to: {}", s.listening);
                // We drop the lock before calling the server management to avoid deadlocks
                drop(s);
                start_or_stop_server(Arc::clone(&state));
            }
        }
    });
}

fn start_or_stop_server(state: Arc<Mutex<AppState>>) {
    let mut s = state.lock().unwrap();
    
    // 1. Force stop existing server
    if let Some(abort) = s.server_abort.take() {
        let _ = abort.send(());
        tracing::info!("📡 Stopping API server...");
    }

    // 2. Start if enabled
    if s.listening {
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        s.server_abort = Some(tx);
        
        tokio::spawn(async move {
            let cors = CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET, Method::POST])
                .allow_headers(Any);

            let app = api::router::create_router().layer(cors);
            let addr = SocketAddr::from(([127, 0, 0, 1], 8080));
            
            let listener = match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => l,
                Err(e) => {
                    tracing::error!("❌ Could not bind to {}: {}", addr, e);
                    return;
                }
            };

            tracing::info!("🚀 API Server starting on {}", addr);
            
            let server = axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    rx.await.ok();
                    tracing::info!("📡 API Server shut down successfully.");
                });

            if let Err(e) = server.await {
                tracing::error!("💥 Server error: {}", e);
            }
        });
    } else {
        tracing::info!("📴 API Server is now DISABLED.");
    }
}

fn load_icon() -> Icon {
    let mut rgba = vec![0u8; 32 * 32 * 4];
    let green = [0, 207, 127, 255];
    let black = [0, 0, 0, 255];
    let dark_green = [0, 150, 90, 255];
    let transparent = [0, 0, 0, 0];

    for i in 0..(32 * 32) {
        rgba[i * 4..i * 4 + 4].copy_from_slice(&transparent);
    }

    for y in 0..32 {
        for x in 0..32 {
            let i = (y * 32 + x) * 4;
            let dx = x as f32;
            let dy = y as f32;

            if dx >= 8.0 && dx <= 23.0 && dy >= 12.0 && dy <= 20.0 {
                rgba[i..i+4].copy_from_slice(&green);
            }
            let dist_l = ((dx - 9.0).powi(2) + (dy - 18.0).powi(2)).sqrt();
            if dist_l < 7.0 { rgba[i..i+4].copy_from_slice(&green); }
            let dist_r = ((dx - 22.0).powi(2) + (dy - 18.0).powi(2)).sqrt();
            if dist_r < 7.0 { rgba[i..i+4].copy_from_slice(&green); }
            
            let br_x = 22.0; let br_y = 15.0;
            if ((dx - br_x).abs() < 1.0 && (dy - (br_y-2.0)).abs() < 1.0) ||
               ((dx - br_x).abs() < 1.0 && (dy - (br_y+2.0)).abs() < 1.0) ||
               ((dx - (br_x-2.0)).abs() < 1.0 && (dy - br_y).abs() < 1.0) ||
               ((dx - (br_x+2.0)).abs() < 1.0 && (dy - br_y).abs() < 1.0)
            { rgba[i..i+4].copy_from_slice(&black); }
            
            let dl_x = 9.0; let dl_y = 15.0;
            if ((dx - dl_x).abs() <= 2.0 && (dy - dl_y).abs() < 1.0) || 
               ((dx - dl_x).abs() < 1.0 && (dy - dl_y).abs() <= 2.0)
            { rgba[i..i+4].copy_from_slice(&black); }

            let joy_l_x = 12.0; let joy_l_y = 18.0;
            let joy_r_x = 19.0; let joy_r_y = 18.0;
            if ((dx - joy_l_x).powi(2) + (dy - joy_l_y).powi(2)).sqrt() < 2.2 ||
               ((dx - joy_r_x).powi(2) + (dy - joy_r_y).powi(2)).sqrt() < 2.2 
            { rgba[i..i+4].copy_from_slice(&dark_green); }
        }
    }
    Icon::from_rgba(rgba, 32, 32).expect("Failed to create icon")
}
