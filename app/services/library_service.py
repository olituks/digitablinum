import os
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from urllib.parse import quote

from ..config import BASE_DIR, ALLOWED_EXTENSIONS
from ..utils import normalize_path, format_size, get_file_url

logger = logging.getLogger("app.services.library")

class LibraryService:
    @staticmethod
    def get_all_game_folders() -> List[Path]:
        """Récupère tous les dossiers de jeux à la racine de la bibliothèque."""
        if not BASE_DIR.exists():
            return []
        try:
            return sorted([d for d in BASE_DIR.iterdir() if d.is_dir() and not d.name.startswith('.')])
        except Exception as e:
            logger.error(f"Erreur lors de l'accès à la bibliothèque : {e}")
            return []

    @staticmethod
    def scan_physical_files(folder_path: Path, pinned_paths: set = None) -> List[Dict[str, Any]]:
        """Scanne les fichiers physiques présents dans un dossier de jeu."""
        files = []
        if not folder_path.exists():
            return files

        # Fichiers à exclure de l'affichage direct
        excluded = [".metadata.json", "description.txt", "cover.jpg", "cover.png", "folder.jpg", "cover.webp"]

        for entry in folder_path.iterdir():
            if entry.name.startswith('.') or entry.name.startswith('@') or entry.name in excluded:
                continue
            
            abs_path_str = normalize_path(entry.absolute())
            if entry.is_dir():
                files.append({
                    "filename": entry.name, "is_folder": True, "url": f"/view?path={quote(abs_path_str)}",
                    "is_pinned": False, "absolute_path": abs_path_str
                })
            else:
                files.append({
                    "filename": entry.name, "is_folder": False, 
                    "size_str": format_size(entry.stat().st_size), 
                    "url": get_file_url(entry),
                    "is_pinned": pinned_paths and abs_path_str in pinned_paths, 
                    "absolute_path": abs_path_str
                })
        
        # Tri : Dossiers d'abord, puis épinglés, puis alphabétique
        files.sort(key=lambda x: (not x["is_folder"], not x.get("is_pinned", False), x["filename"].lower()))
        return files

    @staticmethod
    def build_virtual_tree(archived_files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Transforme une liste plate de fichiers archivés en arborescence hiérarchique."""
        tree = {"_is_dir": True, "children": {}, "name": "root"}
        
        for f in archived_files:
            rel_path = f.get("rel_path", "").strip("/")
            if not rel_path: continue
            
            parts = rel_path.split('/')
            current = tree
            
            for i, part in enumerate(parts):
                is_last = (i == len(parts) - 1)
                if is_last:
                    current["children"][part] = {
                        "_is_dir": False,
                        "filename": part,
                        "rel_path": f["rel_path"],
                        "size_str": f.get("size_str", "0 o"),
                        "nfo_content": f.get("nfo_content", "")
                    }
                else:
                    if part not in current["children"] or not current["children"][part].get("_is_dir"):
                        current["children"][part] = {"_is_dir": True, "name": part, "children": {}}
                    current = current["children"][part]
        return tree

    @staticmethod
    def detect_archive(folder_path: Path) -> Optional[Path]:
        """Détecte la présence d'un fichier .iso ou .zip dans le dossier."""
        if not folder_path.exists(): return None
        for f in folder_path.iterdir():
            if f.is_file() and f.suffix.lower() in ['.iso', '.zip']:
                return f
        return None

    @staticmethod
    def read_nfo(file_path: Path) -> Dict[str, Any]:
        """Lit un fichier NFO avec détection d'encodage."""
        if not file_path.exists() or file_path.suffix.lower() != '.nfo':
            return {"content": "Fichier introuvable", "encoding": "unknown"}
            
        for enc in ['cp437', 'utf-8', 'latin-1']:
            try:
                content = file_path.read_text(encoding=enc)
                return {"content": content, "encoding": enc}
            except:
                continue
        return {"content": "Erreur d'encodage", "encoding": "unknown"}
