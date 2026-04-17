import html
import json
import logging
from pathlib import Path
from urllib.parse import quote
from typing import Optional

from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse

from ..config import BASE_DIR, APP_VERSION
from ..models import PinnedFile, GameMeta, UserReview, Tag, GameFamily
from ..schemas import TagSchema
from ..utils import (
    get_file_url, get_cover_url_with_timestamp, get_game_thumbnail_url, 
    normalize_path, has_sidecar_metadata, format_size
)
from ..dependencies import templates, DB, CurrentUser
from ..services.library_service import LibraryService
from ..services.metadata_service import MetadataService

logger = logging.getLogger("app.routers.gallery")
router = APIRouter()

@router.get("/api/games/read-nfo", summary="Lire un fichier NFO / Read NFO file")
def read_nfo(path: str, user: CurrentUser):
    """
    [FR] Lit et retourne le contenu d'un fichier .nfo textuel.
    [EN] Reads and returns the content of a textual .nfo file.
    """
    if not user: raise HTTPException(401)
    return LibraryService.read_nfo(Path(path))

@router.get("/debug/buttons", response_class=HTMLResponse, summary="Boutons de débogage / Debug Buttons")
def debug_buttons(request: Request, user: CurrentUser):
    """
    [FR] Page interne pour tester les différents styles de boutons et composants UI.
    [EN] Internal page to test various button styles and UI components.
    """
    return templates.TemplateResponse(request, "debug_buttons.html", {"user": user, "APP_VERSION": "DEBUG"})

@router.get("/", response_class=HTMLResponse, summary="Accueil / Root")
def root(request: Request, user: CurrentUser):
    """
    [FR] Redirige vers la vue de la bibliothèque principale.
    [EN] Redirects to the main library view.
    """
    if not user: return RedirectResponse("/login")
    return RedirectResponse(f"/view?path={html.escape(str(BASE_DIR))}")

@router.get("/view", response_class=HTMLResponse, summary="Galerie ou Fiche Jeu / Gallery or Game View")
def view(request: Request, path: str, db: DB, user: CurrentUser, background_tasks: BackgroundTasks, edit: bool = False):
    """
    [FR] Point d'entrée principal pour l'affichage. Affiche soit la galerie (si le chemin est la racine) soit la fiche détaillée d'un jeu.
    [EN] Main display entry point. Shows either the gallery (if path is root) or the detailed game page.
    """
    if not user: return RedirectResponse("/login")
    
    target = Path(path)
    abs_target_path = normalize_path(target.absolute())

    # --- MODE GALERIE ---
    if str(target) == str(BASE_DIR):
        user_reviews = {r.folder_path.lower(): r.rating for r in db.query(UserReview).filter(UserReview.user_id == user.id).all()}
        
        from sqlalchemy.orm import joinedload
        all_meta = {m.folder_path.lower(): m for m in db.query(GameMeta).options(joinedload(GameMeta.family)).all()}
        
        from ..models import game_tags
        all_tags = db.query(Tag).join(game_tags).distinct().all()
        all_tags_serialized = [TagSchema.model_validate(t).model_dump() for t in all_tags]

        games = []
        for d in LibraryService.get_all_game_folders():
            folder_abs = normalize_path(d.absolute())
            meta = all_meta.get(folder_abs.lower())
            
            # Fallback sidecar si absent de la DB ou si on veut être sûr pour la Collection
            meta_file = None
            if not meta or not meta.family:
                meta_file = MetadataService.load_sidecar(d)

            game_tags = [TagSchema.model_validate(t).model_dump() for t in meta.tags_list] if meta and meta.tags_list else []
            if not game_tags and meta_file and meta_file.tags:
                game_tags = [t.model_dump() for t in meta_file.tags]

            family_name = None
            if meta and meta.family:
                family_name = meta.family.name
            elif meta_file and meta_file.family:
                family_name = meta_file.family

            display_title = d.name
            if family_name and display_title.lower().startswith(family_name.lower()):
                # On retire le préfixe pour éviter la duplication lors de l'affichage combiné
                temp_title = display_title[len(family_name):].strip()
                # Nettoyage des séparateurs résiduels
                if temp_title.startswith('-') or temp_title.startswith(':') or temp_title.startswith('–'):
                    temp_title = temp_title[1:].strip()
                if temp_title:
                    display_title = temp_title

            games.append({
                "title": d.name, "display_title": display_title, "folder_name": folder_abs, "cover_url": get_game_thumbnail_url(d),
                "link_url": f"/view?path={quote(folder_abs)}", "user_rating": user_reviews.get(folder_abs.lower()),
                "ctime": d.stat().st_ctime if d.exists() else 0, "release_date": meta.release_date if meta and meta.release_date else (meta_file.release_date if meta_file else ""),
                "tags": game_tags,
                "family": family_name
            })
        
        pins = db.query(PinnedFile).filter(PinnedFile.user_id == user.id).all()
        pinned_files = [{"id": p.id, "filename": p.filename or Path(p.file_path).name, "absolute_path": p.file_path, "thumbnail": p.thumbnail_base64} for p in pins if Path(p.file_path).exists()]
                
        return templates.TemplateResponse(request, "gallery.html", {"games": games, "user": user, "pinned_files": pinned_files, "all_tags": all_tags_serialized})
    
    # --- MODE FICHE JEU ---
    pinned_paths = {p[0] for p in db.query(PinnedFile.file_path).filter(PinnedFile.user_id == user.id).all()}
    cover_url = get_cover_url_with_timestamp(target)
    if cover_url == "None": cover_url = None
    
    meta_db = db.query(GameMeta).filter(GameMeta.folder_path == abs_target_path).first()
    meta_file = MetadataService.load_sidecar(target)
    
    metadata_source_label = "Base de données" if meta_db else "Fichier Sidecar (Fallback)"
    logger.info(f"Source des métadonnées pour {target.name} : {metadata_source_label}")
    metadata_source = "db" if meta_db else "sidecar"

    if meta_db and meta_file:
        if meta_db.title_fr != meta_file.title_fr or meta_db.description != meta_file.synopsis:
            logger.warning(f"⚠️ MISMATCH détecté entre DB et Sidecar pour {target.name}")

    description = (meta_db.description if meta_db and meta_db.description else (meta_file.synopsis if meta_file else "Aucune description disponible."))
    def get_names(items): return ", ".join([i.name for i in items])
    
    game_meta = {
        "title_fr": (meta_db.title_fr if meta_db and meta_db.title_fr else (meta_file.title_fr if meta_file else "")),
        "title_en": (meta_db.title_en if meta_db and meta_db.title_en else (meta_file.title_en if meta_file else "")),
        "genre": (meta_db.genre if meta_db and meta_db.genre else (meta_file.genre if meta_file else "")),
        "keywords": (meta_db.keywords if meta_db and meta_db.keywords else (meta_file.keywords if meta_file else "")),
        "release_date": (meta_db.release_date if meta_db and meta_db.release_date else (meta_file.release_date if meta_file else "")),
        "universe": (meta_db.universe if meta_db and meta_db.universe else (meta_file.universe if meta_file else "")),
        "youtube_urls": (meta_db.youtube_urls if meta_db and meta_db.youtube_urls else (meta_file.youtube_urls if meta_file else "")),
        "steam_url": (meta_db.steam_url if meta_db and meta_db.steam_url else (meta_file.steam_url if meta_file else "")),
        "igdb_id": (meta_db.igdb_id if meta_db and meta_db.igdb_id else (meta_file.igdb_id if meta_file else "")),
        "rating": (meta_db.rating if meta_db and meta_db.rating is not None else (meta_file.rating if meta_file else "")),
        "developer": get_names(meta_db.developers_list) if meta_db else (meta_file.developer if meta_file else ""),
        "studio": get_names(meta_db.studios_list) if meta_db else (meta_file.studio if meta_file else ""),
        "platform": get_names(meta_db.platforms_list) if meta_db else (meta_file.platform if meta_file else ""),
        "publisher": get_names(meta_db.publishers_list) if meta_db else (meta_file.publisher if meta_file else ""),
        "tags": ([TagSchema.model_validate(t).model_dump() for t in meta_db.tags_list] if meta_db and meta_db.tags_list else (meta_file.tags if meta_file and meta_file.tags else [])),
        "family": (meta_db.family.name if meta_db and meta_db.family else (meta_file.family if meta_file else ""))
    }

    physical_files = LibraryService.scan_physical_files(target, pinned_paths)
    has_real_files = len(physical_files) > 0
    
    detected_files = []
    archives_virtual_data = []

    # Map of virtual files indexed by archive name
    archived_data_map = {}
    if meta_db and meta_db.archived_files_json:
        try:
            archived_data = json.loads(meta_db.archived_files_json)
            for f in archived_data:
                a_name = f.get("archive", "unknown")
                if a_name not in archived_data_map: archived_data_map[a_name] = []
                archived_data_map[a_name].append(f)
        except Exception as e:
            logger.error(f"Erreur parsing archived_files_json for {target.name}: {e}")

    # Decision: are we in "Archived Game" mode (virtual files only) or "Standard" mode (physical files + virtual views)
    if meta_db and meta_db.is_archived and archived_data_map and not has_real_files:
        # FULL ARCHIVE MODE
        for f in json.loads(meta_db.archived_files_json):
            detected_files.append({
                "filename": f["rel_path"], "is_folder": False, 
                "size_str": format_size(int(f.get("size_mb", 0) * 1024 * 1024)), 
                "url": "#archived", "is_pinned": False, "is_archived": True, 
                "archive_name": f.get("archive", "")
            })
        for a_name, f_list in archived_data_map.items():
            archives_virtual_data.append({
                "name": a_name, "path": None, 
                "files": LibraryService.build_virtual_tree(f_list), 
                "has_index": True, "on_disk": False
            })
    else:
        # STANDARD MODE (Physical files)
        detected_files = physical_files
        if target.exists():
            for f in target.iterdir():
                if f.is_file() and f.suffix.lower() in ['.iso', '.zip']:
                    # Check if we have indexed content for this specific file
                    a_files = archived_data_map.get(f.name)
                    archives_virtual_data.append({
                        "name": f.name, 
                        "path": normalize_path(f.absolute()), 
                        "files": LibraryService.build_virtual_tree(a_files) if a_files else None, 
                        "has_index": (a_files is not None), 
                        "on_disk": True
                    })

    current_zip_status = meta_db.zip_status if meta_db else "idle"
    current_zip_path = meta_db.zip_path if meta_db else None
    if current_zip_status != "processing":
        found_archive = LibraryService.detect_archive(target)
        if found_archive:
            current_zip_status = "ready"
            current_zip_path = str(found_archive.absolute())
            if meta_db and (meta_db.zip_status != "ready" or meta_db.zip_path != current_zip_path):
                meta_db.zip_status = "ready"
                meta_db.zip_path = current_zip_path
                meta_db.zip_notified = True
                db.commit()

    breadcrumbs = []
    try:
        rel_parts = target.relative_to(BASE_DIR).parts
        accum = BASE_DIR
        for p in rel_parts:
            accum = accum / p
            breadcrumbs.append({"name": p, "url": f"/view?path={quote(str(accum.absolute()))}"})
    except: pass

    user_review = db.query(UserReview).filter(UserReview.user_id == user.id, UserReview.folder_path == abs_target_path).first()
    
    # Récupération des familles pour le sélecteur d'édition
    all_families = db.query(GameFamily).order_by(GameFamily.name).all()
    
    from ..config import AI_PROMPT_DESCRIPTIONS, AI_PROMPT_EDITIONS, AI_PROMPT_LINKS, OPEN_METADATA_MODAL_FOR_NEW_GAME, ARCHIVE_FORMAT, HOST_GAMES_PATH, ISO_DOWNLOAD_ENABLED
    from ..utils import get_system_config
    
    return templates.TemplateResponse(request, "game_view.html", {
        "user": user, "archive_format": ARCHIVE_FORMAT.upper(),
        "ai_prompt_desc": AI_PROMPT_DESCRIPTIONS.replace("{query}", target.name),
        "ai_prompt_editions": AI_PROMPT_EDITIONS.replace("{game_title}", target.name),
        "ai_prompt_links": AI_PROMPT_LINKS,
        "open_modal_auto": OPEN_METADATA_MODAL_FOR_NEW_GAME and (target.parent.resolve() == BASE_DIR.resolve()),
        "force_edit": edit, "has_sidecar": has_sidecar_metadata(target), "metadata_source": metadata_source,
        "archives_virtual_data": archives_virtual_data, "agent_token": get_system_config(db, "AGENT_AUTH_TOKEN", "default_secret_token"),
        "host_games_path": HOST_GAMES_PATH, "iso_download_enabled": ISO_DOWNLOAD_ENABLED,
        "has_iso": any(f.is_file() and f.suffix.lower() == '.iso' for f in target.iterdir()) if target.exists() else False,
        "all_families": all_families,
        "game": {
            "title": target.name, "base_path": str(target.absolute()), "cover_url": cover_url,
            "description": description, "files": detected_files, "breadcrumbs": breadcrumbs,
            "external_links": json.loads(meta_db.external_links) if meta_db and meta_db.external_links else [],
            "meta": game_meta, "is_new": (meta_db is None),
            "editions_cache": json.loads(meta_db.editions_cache) if meta_db and meta_db.editions_cache else [],
            "is_archived": meta_db.is_archived if meta_db else False,
            "zip_status": current_zip_status, "zip_progress": meta_db.zip_progress if meta_db else 0,
            "zip_path": current_zip_path, "zip_url": get_file_url(Path(current_zip_path)) if current_zip_path else None,
            "user_rating": (user_review.rating if user_review and user_review.rating is not None else 0),
            "user_comment": (user_review.comment if user_review and user_review.comment else "")
        }
    })
