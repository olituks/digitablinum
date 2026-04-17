import os
import logging
import asyncio
import traceback
from pathlib import Path
from contextlib import asynccontextmanager
from anyio.to_thread import run_sync

from .config import BASE_DIR, APP_VERSION, THUMB_DIR, SECRET_KEY, LOG_LEVEL

logger = logging.getLogger("app")

from fastapi import FastAPI, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from .database import engine, Base, get_db, SessionLocal
from .migrations_manager import setup_database
from .auth import get_current_user
from .utils import create_db_backup, rotate_backups
from .i18n_service import i18n_service
from .dependencies import templates, current_lang, get_language
from .routers import (
    auth_router, gallery_router, 
    api_data_router, admin_router, ia_router, users_router
)
from .services.library_service import LibraryService
from .services.metadata_service import MetadataService

async def run_startup_tasks(app: FastAPI):
    """Exécute les tâches lourdes de démarrage en tâche de fond."""
    logger.info("--- STARTUP TASKS INITIATED ---")
    app.state.is_initializing = True
    try:
        await run_sync(setup_database)
        await run_sync(create_db_backup)
        await run_sync(rotate_backups)

        folders = await run_sync(LibraryService.get_all_game_folders)
        if not folders:
            logger.info("Aucun dossier de jeu trouvé.")
            return

        db = SessionLocal()
        try:
            from .models import SyncLog, GameMeta
            # On ne considère l'initialisation comme "en cours" (pour l'affichage) 
            # que si la DB est effectivement vide ou très peu remplie.
            game_count = db.query(GameMeta).count()
            app.state.show_init_message = (game_count == 0)

            migrated_count = 0
            synced_count = 0
            skipped_count = 0
            errors = []
            
            logger.info(f"Scan initial : {len(folders)} jeux détectés.")
            for d in folders:
                await asyncio.sleep(0)
                try:
                    if await run_sync(MetadataService.migrate_legacy, d): migrated_count += 1
                    if await run_sync(MetadataService.sync_to_db, d, db): synced_count += 1
                    else: skipped_count += 1
                except Exception as e:
                    err_msg = f"Error in {d.name}: {e}"
                    logger.error(err_msg)
                    errors.append(err_msg)

            new_log = SyncLog(migrated_count=migrated_count, synced_count=synced_count, errors="; ".join(errors) if errors else None)
            db.add(new_log)
            db.commit()
            logger.info(f"Initialisation terminée. Migrés: {migrated_count}, Sync: {synced_count}, Skipped: {skipped_count}")
        except Exception as e:
            logger.error(f"Erreur globale lors des startup tasks : {e}")
        finally:
            db.close()
    finally:
        app.state.is_initializing = False
        app.state.show_init_message = False
        logger.info("--- STARTUP TASKS COMPLETE ---")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup root logger for the app run
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL, logging.ERROR),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        force=True
    )
    logger.info(f"Démarrage de l'application v{APP_VERSION} (LOG_LEVEL={LOG_LEVEL})")
    
    app.state.is_initializing = False
    app.state.show_init_message = False
    
    asyncio.create_task(run_startup_tasks(app))
    yield
    logger.info("Application shutting down...")

# --- FILTRE LOGS ---
class SuccessPollFilter(logging.Filter):
    def filter(self, record):
        return "/api/user/zip-notifications" not in record.getMessage()

for name in logging.root.manager.loggerDict:
    if "uvicorn" in name:
        logging.getLogger(name).addFilter(SuccessPollFilter())

# --- OPENAPI TAGS DEFINITION ---
tags_metadata = [
    {"name": "Auth", "description": "Authentification (Locale & OIDC/Authelia)."},
    {"name": "Gallery", "description": "Navigation dans la bibliothèque et fiches de jeux."},
    {"name": "Admin", "description": "Opérations d'administration et maintenance."},
    {"name": "API Data", "description": "Endpoints de données pour le frontend."},
    {"name": "IA", "description": "Enrichissement des métadonnées et recherche de couvertures."},
    {"name": "Users", "description": "Gestion des profils et avis utilisateurs."},
]

app = FastAPI(
    title="PC Games Collection Manager",
    description="""
Documentation de l'API du gestionnaire de collection de jeux PC.
Cette API permet de gérer la bibliothèque, d'enrichir les métadonnées via l'IA,
et de piloter l'agent local pour le montage d'images disque.

**Licence :** GNU AGPLv3
""",
    version=APP_VERSION,
    contact={
        "name": "Initial Developer",
        "url": "https://github.com/votre-depot",
    },
    license_info={
        "name": "GNU AGPLv3",
        "url": "https://www.gnu.org/licenses/agpl-3.0.html",
    },
    openapi_tags=tags_metadata,
    lifespan=lifespan
)

# --- GLOBAL EXCEPTION HANDLER ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Capture et logue TOUTES les erreurs inattendues pour le debug production."""
    err_detail = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    logger.error(f"FATAL ERROR on {request.url.path}:\n{err_detail}")
    return JSONResponse(
        status_code=500,
        content={"ok": False, "message": "Erreur interne serveur", "detail": str(exc)}
    )

# --- MIDDLEWARES ---
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)

@app.middleware("http")
async def i18n_middleware(request: Request, call_next):
    i18n_service.reload()
    lang = get_language(request)
    token = current_lang.set(lang)
    try:
        return await call_next(request)
    finally:
        current_lang.reset(token)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    csp_policy = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
        "img-src 'self' data: *; "
        "frame-src 'self' www.youtube.com; "
        "connect-src 'self' http://127.0.0.1:8080;"
    )
    response.headers["Content-Security-Policy"] = csp_policy
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response

@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/static", "/library", "/thumbnail")):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response

# --- ROUTERS ---
app.include_router(auth_router, tags=["Auth"])
app.include_router(gallery_router, tags=["Gallery"])
app.include_router(api_data_router, tags=["API Data"])
app.include_router(admin_router, tags=["Admin"])
app.include_router(ia_router, tags=["IA"])
app.include_router(users_router, tags=["Users"])

# --- MOUNTS ---
app.mount("/library", StaticFiles(directory=BASE_DIR, check_dir=False), name="library")
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/thumbnail", StaticFiles(directory=THUMB_DIR), name="thumbnail")

logger.info(f"PC Games Collection v{APP_VERSION} ready.")
