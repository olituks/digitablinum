import shutil
import logging
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks

from ..models import GameMeta, PinnedFile
from ..utils import normalize_path, investigate_archive, create_game_zip
from .library_service import LibraryService
from .metadata_service import MetadataService

logger = logging.getLogger("app.services.game")

class GameService:
    @staticmethod
    def delete_game(folder_path: Path, db: Session):
        """Supprime un jeu physiquement et ses traces en base de données."""
        if not folder_path.exists() or not folder_path.is_dir():
            return False
            
        norm_path = normalize_path(folder_path)
        try:
            db.query(GameMeta).filter(GameMeta.folder_path == norm_path).delete()
            db.query(PinnedFile).filter(PinnedFile.file_path.like(f"{norm_path}%")).delete()
            shutil.rmtree(folder_path)
            db.commit()
            logger.info(f"Jeu supprimé : {folder_path.name}")
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"Erreur lors de la suppression du jeu {folder_path.name}: {e}")
            return False

    @staticmethod
    def restore_from_backup(folder_path: Path, db: Session) -> bool:
        """Restaure les fichiers originaux depuis le dossier .backup."""
        backup_dir = folder_path / ".backup"
        if not backup_dir.exists() or not backup_dir.is_dir():
            return False
            
        try:
            for item in backup_dir.iterdir():
                dest = folder_path / item.name
                if dest.exists():
                    if dest.is_dir(): shutil.rmtree(dest)
                    else: dest.unlink()
                shutil.move(str(item), str(dest))
                
            if not any(backup_dir.iterdir()):
                backup_dir.rmdir()
                
            norm_path = normalize_path(folder_path)
            record = db.query(GameMeta).filter(GameMeta.folder_path == norm_path).first()
            if record:
                record.is_archived = False
                record.archived_files_json = None
                db.commit()
                
            logger.info(f"Jeu restauré : {folder_path.name}")
            return True
        except Exception as e:
            logger.error(f"Erreur restauration {folder_path.name}: {e}")
            return False

    @staticmethod
    def rename_folder(old_path: Path, new_name: str, db: Session) -> Optional[str]:
        """Renomme un dossier de jeu et met à jour les chemins en DB."""
        new_path = old_path.parent / new_name
        if new_path.exists():
            return None
            
        old_norm = normalize_path(old_path)
        new_norm = normalize_path(new_path)
        
        try:
            old_path.rename(new_path)
            db.query(GameMeta).filter(GameMeta.folder_path == old_norm).update({"folder_path": new_norm})
            pins = db.query(PinnedFile).filter(PinnedFile.file_path.like(f"{old_norm}%")).all()
            for p in pins:
                p.file_path = p.file_path.replace(old_norm, new_norm)
            db.commit()
            return new_norm
        except Exception as e:
            db.rollback()
            logger.error(f"Erreur renommage {old_path.name} -> {new_name}: {e}")
            return None

    @staticmethod
    def investigate_archive(archive_path: Path, db: Session) -> Dict[str, Any]:
        """Analyse une archive et indexe son contenu en DB."""
        if not archive_path.exists():
            return {"ok": False, "message": "Archive introuvable"}
            
        file_index = investigate_archive(archive_path)
        if not file_index:
            return {"ok": False, "message": "Échec analyse"}
            
        folder_str = normalize_path(archive_path.parent)
        db_meta = db.query(GameMeta).filter(GameMeta.folder_path == folder_str).first()
        if not db_meta:
            db_meta = GameMeta(folder_path=folder_str)
            db.add(db_meta)
            
        existing_files = []
        if db_meta.archived_files_json:
            try:
                existing_files = json.loads(db_meta.archived_files_json)
            except: pass
            
        archive_name = archive_path.name
        merged_files = [f for f in existing_files if f.get("archive") != archive_name]
        merged_files.extend(file_index)

        db_meta.is_archived = True
        db_meta.archived_files_json = json.dumps(merged_files, ensure_ascii=False)
        
        # Extraction synopsis
        if not db_meta.description or db_meta.description == "Aucune description disponible.":
            all_nfo = [f["nfo_content"] for f in merged_files if f.get("nfo_content")]
            if all_nfo:
                db_meta.description = "\n\n".join(all_nfo)
                
        db.commit()
        return {"ok": True, "count": len(file_index)}

    @staticmethod
    def start_zip_task(folder_path: Path, db: Session, background_tasks: BackgroundTasks, archive_mode: bool = False):
        """Lance une tâche de fond pour zipper ou archiver un dossier."""
        folder_str = normalize_path(folder_path)
        db_meta = db.query(GameMeta).filter(GameMeta.folder_path == folder_str).first()
        
        if not db_meta:
            db_meta = GameMeta(folder_path=folder_str)
            db.add(db_meta)
            db.commit()
            db.refresh(db_meta)
            
        if db_meta.zip_status == "processing":
            return {"ok": False, "message": "Tâche déjà en cours"}
            
        background_tasks.add_task(create_game_zip, folder_path, db, archive_mode=archive_mode)
        return {"ok": True}
