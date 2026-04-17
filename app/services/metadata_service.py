import json
import logging
from pathlib import Path
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime

from ..models import (
    GameMeta, Developer, Studio, Platform, Publisher, Genre, Tag, GameFamily,
    game_developers, game_studios, game_platforms, game_publishers, game_genres, game_tags
)
from ..schemas import UnifiedMetadata, TagSchema
from ..utils import normalize_path, calculate_file_hash

logger = logging.getLogger("app.services.metadata")

class MetadataService:
    @staticmethod
    def load_sidecar(folder_path: Path) -> Optional[UnifiedMetadata]:
        """Charge les métadonnées depuis le fichier .metadata.json."""
        meta_p = folder_path / ".metadata.json"
        if not meta_p.exists():
            return None
        try:
            from ..utils import load_unified_metadata
            return load_unified_metadata(folder_path)
        except Exception as e:
            logger.error(f"Erreur lecture sidecar {folder_path.name}: {e}")
            return None

    @staticmethod
    def save_sidecar(folder_path: Path, metadata: UnifiedMetadata):
        """Sauvegarde les métadonnées dans le fichier .metadata.json."""
        meta_p = folder_path / ".metadata.json"
        try:
            metadata.last_updated = datetime.now().isoformat()
            meta_p.write_text(metadata.model_dump_json(indent=4), encoding='utf-8')
            return True
        except Exception as e:
            logger.error(f"Erreur écriture sidecar {folder_path.name}: {e}")
            return False

    @staticmethod
    def migrate_legacy(folder_path: Path) -> bool:
        """Fusionne les anciens fichiers .suggestions.json et description.txt en un seul .metadata.json."""
        suggestions_p = folder_path / ".suggestions.json"
        description_p = folder_path / "description.txt"
        metadata_p = folder_path / ".metadata.json"
        
        if not suggestions_p.exists() and not description_p.exists(): return False
        
        data = {}
        if metadata_p.exists():
            try: data = json.loads(metadata_p.read_text(encoding='utf-8'))
            except: pass
                
        if description_p.exists():
            try:
                synopsis = description_p.read_text(encoding='utf-8').strip()
                if synopsis: data["synopsis"] = synopsis
            except: pass
                
        if suggestions_p.exists():
            try:
                suggestions = json.loads(suggestions_p.read_text(encoding='utf-8'))
                if suggestions: data["ai_suggestions_cache"] = suggestions
            except: pass
                
        if not data: return False
            
        try:
            if "version" not in data: data["version"] = "1.0"
            data["last_updated"] = datetime.now().isoformat()
            metadata_p.write_text(json.dumps(data, ensure_ascii=False, indent=4), encoding='utf-8')
            if suggestions_p.exists(): suggestions_p.unlink()
            if description_p.exists(): description_p.unlink()
            return True
        except: return False

    @staticmethod
    def sync_to_db(folder_path: Path, db: Session, force: bool = False, current_hash: Optional[str] = None, meta_obj: Optional[UnifiedMetadata] = None) -> bool:
        """Synchronise le fichier sidecar vers la base de données."""
        if not meta_obj:
            meta_file = MetadataService.load_sidecar(folder_path)
        else:
            meta_file = meta_obj

        if not meta_file: return False

        norm_path = normalize_path(folder_path)
        if not current_hash:
            current_hash = calculate_file_hash(folder_path / ".metadata.json")
            
        record = db.query(GameMeta).filter(GameMeta.folder_path == norm_path).first()
        
        if record and record.sidecar_hash == current_hash and not force:
            return False

        if not record:
            record = GameMeta(folder_path=norm_path)
            db.add(record)

        record.title_fr = meta_file.title_fr
        record.title_en = meta_file.title_en
        record.description = meta_file.synopsis
        record.genre = meta_file.genre
        record.keywords = meta_file.keywords
        record.release_date = meta_file.release_date
        record.universe = meta_file.universe
        record.youtube_urls = json.dumps(meta_file.youtube_urls) if isinstance(meta_file.youtube_urls, list) else meta_file.youtube_urls
        record.steam_url = meta_file.steam_url
        record.igdb_id = meta_file.igdb_id
        record.rating = meta_file.rating
        record.is_archived = meta_file.is_archived
        record.sidecar_hash = current_hash
        
        if meta_file.ai_suggestions_cache: record.ai_suggestions_cache = json.dumps(meta_file.ai_suggestions_cache)
        if meta_file.editions_cache: record.editions_cache = json.dumps(meta_file.editions_cache)
        if meta_file.external_links: record.external_links = json.dumps(meta_file.external_links)

        # Synchronisation de la famille
        logger.info(f"Sync Famille pour {record.title_fr or record.folder_path}: sidecar family='{meta_file.family}', sidecar family_id={getattr(meta_file, 'family_id', None)}")
        if getattr(meta_file, 'family_id', None) is not None:
            record.family_id = meta_file.family_id
        elif meta_file.family:
            family = db.query(GameFamily).filter(GameFamily.name == meta_file.family).first()
            if not family:
                logger.info(f"Création d'une nouvelle collection: {meta_file.family}")
                family = GameFamily(name=meta_file.family)
                db.add(family)
                db.flush()
            record.family_id = family.id
            logger.info(f"Assignation collection ID {family.id} à {record.title_fr}")
        else:
            record.family_id = None

        MetadataService._sync_m2m_relations(record, meta_file, db)
        db.commit()
        from ..config import DB_FILENAME
        logger.info(f"Synchronisation DB réussie ({DB_FILENAME.name}) pour {folder_path.name}")
        return True

    @staticmethod
    def _sync_m2m_relations(record: GameMeta, meta_file: UnifiedMetadata, db: Session):
        """Gère la mise à jour des relations Many-to-Many."""
        def sync_list(attr_name, model_class, names_str):
            if names_str is None: return
            names = [n.strip() for n in names_str.split(',') if n.strip()]
            items = []
            for name in names:
                item = db.query(model_class).filter(model_class.name == name).first()
                if not item:
                    item = model_class(name=name)
                    db.add(item)
                    db.flush()
                items.append(item)
            setattr(record, attr_name, items)

        sync_list("developers_list", Developer, meta_file.developer)
        sync_list("studios_list", Studio, meta_file.studio)
        sync_list("platforms_list", Platform, meta_file.platform)
        sync_list("publishers_list", Publisher, meta_file.publisher)
        sync_list("genres_list", Genre, meta_file.genre)

        if meta_file.tags:
            tag_items = []
            for t_schema in meta_file.tags:
                tag = db.query(Tag).filter(Tag.name == t_schema.name, Tag.family == t_schema.family).first()
                if not tag:
                    tag = Tag(name=t_schema.name, family=t_schema.family, color=t_schema.color)
                    db.add(tag)
                    db.flush()
                tag_items.append(tag)
            record.tags_list = tag_items
