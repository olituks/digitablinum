import os
import hashlib
import logging
from pathlib import Path
from typing import Optional, Tuple, Dict
from PIL import Image
from ..config import THUMB_DIR

# Importation du plugin AVIF pour Pillow
try:
    import pillow_avif
    AVIF_SUPPORTED = True
except ImportError:
    AVIF_SUPPORTED = False

logger = logging.getLogger("app.services.image")

class ImageService:
    # Target heights for different usages
    GALLERY_HEIGHT = 400
    VIEW_HEIGHT = 900

    @staticmethod
    def get_optimized_url(folder_path: Path, usage: str = "gallery") -> Optional[Dict[str, str]]:
        """
        Génère ou récupère des versions optimisées de la couverture.
        Retourne un dictionnaire avec les URLs (webp, avif).
        """
        # 1. Trouver l'image source
        source_p = None
        for name in ["cover.jpg", "cover.png", "folder.jpg", "cover.webp"]:
            p = folder_path / name
            if p.exists():
                source_p = p
                break
        
        if not source_p:
            return None

        # 2. Déterminer le chemin du cache
        folder_hash = hashlib.md5(str(folder_path.absolute()).encode()).hexdigest()
        target_height = ImageService.GALLERY_HEIGHT if usage == "gallery" else ImageService.VIEW_HEIGHT
        
        results = {}
        formats = ["webp"]
        if AVIF_SUPPORTED:
            formats.append("avif")

        for fmt in formats:
            thumb_name = f"{folder_hash}_{usage}.{fmt}"
            thumb_p = THUMB_DIR / thumb_name

            # 3. Vérifier si on doit (re)générer
            must_generate = True
            if thumb_p.exists():
                if thumb_p.stat().st_mtime >= source_p.stat().st_mtime:
                    must_generate = False

            if must_generate:
                try:
                    ImageService._generate_thumbnail(source_p, thumb_p, target_height, fmt.upper())
                    logger.info(f"Thumbnail {fmt} généré ({usage}) pour {folder_path.name}")
                except Exception as e:
                    logger.error(f"Erreur génération thumbnail {fmt} {folder_path.name}: {e}")
                    continue
            
            results[fmt] = f"/thumbnail/{thumb_name}?t={int(thumb_p.stat().st_mtime)}"

        return results if results else None

    @staticmethod
    def _generate_thumbnail(source_p: Path, dest_p: Path, target_height: int, img_format: str = "WEBP"):
        """Redimensionne l'image en conservant l'aspect ratio et l'enregistre au format spécifié."""
        with Image.open(source_p) as img:
            # Conversion en RGB si nécessaire (pour PNG/WebP avec transparence)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            
            # Calcul du ratio
            w, h = img.size
            if h <= target_height:
                # Si l'image est déjà plus petite que la cible, on ne l'agrandit pas
                img.save(dest_p, img_format, quality=80)
                return

            ratio = target_height / h
            new_w = int(w * ratio)
            
            # Utilisation de Lanczos pour la meilleure qualité de réduction
            resized = img.resize((new_w, target_height), Image.Resampling.LANCZOS)
            resized.save(dest_p, img_format, quality=80)
