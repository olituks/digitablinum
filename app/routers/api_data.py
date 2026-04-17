import time
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks

from ..models import FileNote, PinnedFile, GameMeta
from ..utils import calculate_file_hash, normalize_path
from ..config import BASE_DIR
from ..schemas import NoteRequest, PinRequest, ZipRequest, InvestigateRequest
from ..dependencies import DB, CurrentUser, AdminUser
from ..services.game_service import GameService

logger = logging.getLogger("app.routers.api_data")
router = APIRouter()

@router.post("/api/archive/investigate", summary="Investiguer une archive / Investigate archive")
def investigate_archive_endpoint(req: InvestigateRequest, user: AdminUser, db: DB):
    """
    [FR] Analyse le contenu d'une archive (ISO, ZIP) pour indexer les fichiers internes sans extraction physique.
    [EN] Analyzes the content of an archive (ISO, ZIP) to index internal files without physical extraction.
    """
    return GameService.investigate_archive(Path(req.archive_path), db)

@router.post("/api/save_note", summary="Enregistrer une note / Save note")
def save_note(req: NoteRequest, user: CurrentUser, db: DB):
    """
    [FR] Enregistre une note personnelle sur un fichier spécifique (basé sur son hash).
    [EN] Saves a personal note on a specific file (based on its hash).
    """
    if not user: raise HTTPException(401)
    h = calculate_file_hash(Path(req.file_path))
    if not h: return {"ok": False}
    
    n = db.query(FileNote).filter(FileNote.file_hash == h, FileNote.user_id == user.id).first()
    if n: 
        n.content = req.text
    else: 
        db.add(FileNote(file_hash=h, user_id=user.id, content=req.text, updated_at=str(time.time())))
    db.commit()
    return {"ok": True}

@router.get("/api/get_note", summary="Récupérer une note / Get note")
def get_note(file_path: str, user: CurrentUser, db: DB):
    """
    [FR] Récupère la note personnelle associée à un fichier.
    [EN] Retrieves the personal note associated with a file.
    """
    if not user: raise HTTPException(401)
    h = calculate_file_hash(Path(file_path))
    n = db.query(FileNote).filter(FileNote.file_hash == h, FileNote.user_id == user.id).first()
    return {"text": n.content if n else ""}

@router.post("/api/toggle_pin", summary="Épingler un fichier / Toggle pin")
def toggle_pin(req: PinRequest, user: CurrentUser, db: DB):
    """
    [FR] Ajoute ou retire un fichier de la liste des raccourcis épinglés en haut de la galerie.
    [EN] Adds or removes a file from the list of pinned shortcuts at the top of the gallery.
    """
    if not user: raise HTTPException(401)
    existing = db.query(PinnedFile).filter(PinnedFile.file_path == req.file_path, PinnedFile.user_id == user.id).first()
    if existing:
        db.delete(existing)
        is_pinned = False
    else:
        db.add(PinnedFile(user_id=user.id, file_path=req.file_path, filename=Path(req.file_path).name))
        is_pinned = True
    db.commit()
    return {"success": True, "is_pinned": is_pinned}

def _resolve_path(path_str: str) -> Path:
    if path_str.startswith(str(BASE_DIR)): return Path(path_str).resolve()
    return (BASE_DIR / path_str.lstrip("/")).resolve()

@router.post("/api/games/zip/prepare", summary="Préparer une archive ZIP / Prepare ZIP archive")
async def prepare_zip(req: ZipRequest, user: CurrentUser, db: DB, background_tasks: BackgroundTasks):
    """
    [FR] Lance la création d'un fichier ZIP contenant le dossier du jeu pour le téléchargement.
    [EN] Starts creating a ZIP file containing the game folder for download.
    """
    if not user: raise HTTPException(401)
    abs_path = _resolve_path(req.folder_path)
    if not abs_path.exists(): raise HTTPException(404)
    return GameService.start_zip_task(abs_path, db, background_tasks, archive_mode=False)

@router.post("/api/games/archive/start", summary="Archiver définitivement / Start permanent archival")
async def start_archival(req: ZipRequest, user: AdminUser, db: DB, background_tasks: BackgroundTasks):
    """
    [FR] Transforme définitivement un dossier de jeu en archive (ISO ou ZIP) pour gagner de l'espace.
    [EN] Permanently transforms a game folder into an archive (ISO or ZIP) to save space.
    """
    abs_path = _resolve_path(req.folder_path)
    if not abs_path.exists(): raise HTTPException(404)
    return GameService.start_zip_task(abs_path, db, background_tasks, archive_mode=True)

@router.get("/api/games/zip/status", summary="Statut de l'archivage / Archive status")
def get_zip_status(folder_path: str, user: CurrentUser, db: DB):
    """
    [FR] Récupère la progression actuelle de la tâche de création d'archive ou ZIP.
    [EN] Retrieves the current progress of the archive or ZIP creation task.
    """
    if not user: raise HTTPException(401)
    abs_path = _resolve_path(folder_path)
    folder_str = normalize_path(abs_path)
    meta = db.query(GameMeta).filter(GameMeta.folder_path == folder_str).first()
    if not meta: return {"zip_status": "idle", "zip_progress": 0, "zip_path": None}
    return {"zip_status": meta.zip_status, "zip_progress": meta.zip_progress, "zip_path": meta.zip_path}
