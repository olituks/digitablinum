import io
import json
import logging
import secrets
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse

from ..models import User, SyncLog, GameMeta, GameFamily
from ..auth import get_password_hash
from ..utils import (
    create_db_backup, rotate_backups, normalize_path,
    get_system_config, set_system_config, create_folder_iso
)
from ..dependencies import templates, DB, CurrentUser, AdminUser
from ..schemas import (
    FilePathRequest, FolderPathRequest, UserCreateRequest, UserEditRequest, UserDeleteRequest,
    RenameRequest, RenameFolderRequest, FamilyCreateRequest, FamilyEditRequest, GameFamilySchema
)
from ..services.library_service import LibraryService
from ..services.metadata_service import MetadataService
from ..services.game_service import GameService

logger = logging.getLogger("app.routers.admin")
router = APIRouter()

@router.get("/api/admin/agent-token", summary="Récupérer le jeton de l'agent")
def get_agent_token(user: AdminUser, db: DB):
    """
    Récupère le jeton d'authentification actuel nécessaire pour que l'agent local Rust
    puisse communiquer avec le serveur.
    """
    return {"token": get_system_config(db, "AGENT_AUTH_TOKEN", "default_secret_token")}

@router.post("/api/admin/agent-token/rotate", summary="Régénérer le jeton de l'agent")
def rotate_agent_token(user: AdminUser, db: DB):
    """
    Génère un nouveau jeton d'authentification aléatoire pour l'agent local.
    Toute instance de l'agent utilisant l'ancien jeton devra être mise à jour.
    """
    new_token = secrets.token_urlsafe(32)
    set_system_config(db, "AGENT_AUTH_TOKEN", new_token)
    return {"token": new_token}

@router.get("/admin", response_class=HTMLResponse, summary="Page d'administration")
def admin_page(request: Request, user: AdminUser, db: DB):
    """
    Sert la page HTML de l'interface d'administration (gestion des utilisateurs,
    sauvegardes, jetons).
    """
    return templates.TemplateResponse(request, "admin.html", {
        "user": user,
        "users": db.query(User).all(),
        "last_sync": db.query(SyncLog).order_by(SyncLog.timestamp.desc()).first(),
        "agent_token": get_system_config(db, "AGENT_AUTH_TOKEN", "default_secret_token")
    })

@router.post("/api/admin/convert_folder_to_iso", summary="Convertir un dossier en ISO")
async def convert_folder_to_iso_endpoint(req: FilePathRequest, user: AdminUser, db: DB, background_tasks: BackgroundTasks):
    """
    Lance une tâche en arrière-plan pour convertir le dossier spécifié en image disque ISO.
    Utile pour standardiser le format de stockage des jeux.
    """
    target_path = Path(req.file_path)
    if not target_path.exists() or not target_path.is_dir():
        raise HTTPException(404, detail="Dossier introuvable")
    background_tasks.add_task(create_folder_iso, target_path, db)
    return {"ok": True}

@router.post("/api/admin/rename_game_folder", summary="Renommer le dossier d'un jeu")
def rename_game_folder(req: RenameFolderRequest, user: AdminUser, db: DB):
    """
    Renomme physiquement le dossier d'un jeu sur le disque et met à jour
    le chemin dans la base de données.
    """
    new_name = req.new_name.strip()
    if not new_name or any(c in '<>:"/\\|?*' for c in new_name):
        raise HTTPException(400, detail="Nom invalide")
        
    new_path = GameService.rename_folder(Path(req.old_folder_path), new_name, db)
    if not new_path:
        raise HTTPException(400, detail="Erreur renommage")
    return {"ok": True, "new_path": new_path}

@router.post("/api/admin/delete_game", summary="Supprimer un jeu")
def delete_game(req: FolderPathRequest, user: AdminUser, db: DB):
    """
    Supprime un jeu de la bibliothèque. Les fichiers sont déplacés vers le dossier .backup
    avant d'être définitivement supprimés si l'option est configurée.
    """
    if GameService.delete_game(Path(req.folder_path), db):
        return {"ok": True}
    raise HTTPException(500)

@router.post("/api/admin/clear_game_cache", summary="Vider le cache d'un jeu")
def clear_game_cache(req: FolderPathRequest, user: AdminUser, db: DB):
    """
    Supprime le fichier .metadata.json et réinitialise les métadonnées IA
    en base de données pour le jeu spécifié.
    """
    folder = Path(req.folder_path)
    meta_p = folder / ".metadata.json"
    if meta_p.exists(): meta_p.unlink()
    
    record = db.query(GameMeta).filter(GameMeta.folder_path == normalize_path(folder)).first()
    if record:
        record.description = None
        record.ai_suggestions_cache = None
        record.editions_cache = None
        record.sidecar_hash = None
        db.commit()
    return {"ok": True}

@router.get("/api/admin/list_cache_files", summary="Lister les fichiers de cache")
def list_cache_files(folder_path: str, user: AdminUser):
    """
    Liste les fichiers techniques (métadonnées) présents dans le dossier du jeu.
    """
    folder = Path(folder_path)
    cache_files = []
    meta_p = folder / ".metadata.json"
    if meta_p.exists():
        cache_files.append({"name": ".metadata.json", "path": str(meta_p), "size": meta_p.stat().st_size})
    return {"files": cache_files}

@router.post("/api/admin/delete_cache_file", summary="Supprimer un fichier de cache")
def delete_cache_file(req: FilePathRequest, user: AdminUser):
    """
    Supprime un fichier technique spécifique (.metadata.json).
    """
    p = Path(req.file_path)
    if p.exists() and p.name == ".metadata.json":
        p.unlink()
        return {"ok": True}
    raise HTTPException(404)

@router.post("/api/admin/create_user", summary="Créer un utilisateur")
def create_user(req: UserCreateRequest, user: AdminUser, db: DB):
    """
    Crée un nouvel utilisateur (Admin ou Viewer) dans le système.
    """
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(400, detail="Utilisateur existant")
    new_user = User(username=req.username, hashed_password=get_password_hash(req.password), role=req.role, must_change_password=req.must_change)
    db.add(new_user)
    db.commit()
    return {"message": "Succès", "user_id": new_user.id}

@router.post("/api/admin/edit_user", summary="Modifier un utilisateur")
def edit_user(req: UserEditRequest, user: AdminUser, db: DB):
    """
    Met à jour les informations d'un utilisateur (mot de passe ou rôle).
    """
    target = db.query(User).filter(User.id == req.user_id).first()
    if not target: raise HTTPException(404)
    if req.password:
        target.hashed_password = get_password_hash(req.password)
        target.must_change_password = True
    if req.role: target.role = req.role
    db.commit()
    return {"message": "Succès"}

@router.post("/api/admin/delete_user", summary="Supprimer un utilisateur")
def delete_user(req: UserDeleteRequest, user: AdminUser, db: DB):
    """
    Supprime un compte utilisateur du système. Impossible de se supprimer soi-même.
    """
    target = db.query(User).filter(User.id == req.user_id).first()
    if not target or target.id == user.id: raise HTTPException(400)
    db.delete(target)
    db.commit()
    return {"message": "Succès"}

@router.post("/api/admin/restore_game", summary="Restaurer un jeu")
def restore_game(req: FolderPathRequest, user: AdminUser, db: DB):
    """
    Restaure un jeu supprimé précédemment en le déplaçant depuis .backup
    vers le répertoire principal.
    """
    if GameService.restore_from_backup(Path(req.folder_path), db):
        return {"ok": True, "message": "Restauration terminée."}
    raise HTTPException(400, detail="Erreur restauration")

@router.post("/api/admin/backup", summary="Sauvegarde manuelle de la DB")
def manual_backup(user: AdminUser):
    """
    Déclenche une sauvegarde immédiate de la base de données SQLite.
    """
    backup_file = create_db_backup()
    if backup_file:
        rotate_backups()
        return {"message": "Succès", "filename": backup_file}
    raise HTTPException(500)

@router.post("/api/admin/reload_i18n", summary="Recharger les traductions")
def reload_i18n(user: AdminUser):
    """
    Recharge les fichiers JSON de traduction depuis le disque sans redémarrer le serveur.
    """
    from ..i18n_service import i18n_service
    i18n_service.reload()
    return {"ok": True}

@router.post("/api/restart", summary="Redémarrer l'application")
def restart_app(user: AdminUser):
    """
    Déclenche un redémarrage à chaud de l'application (via le hot-reload de Gunicorn/Uvicorn).
    """
    main_py = Path(__file__).parent.parent.parent / "main.py"
    if main_py.exists():
        main_py.touch()
        return {"ok": True}
    return {"ok": False}
