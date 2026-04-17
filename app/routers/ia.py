import json
import logging
import re
import requests
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..schemas import (
    SaveDescRequest, SuggestionRequest, GameMetaSaveRequest, 
    GameLinksRequest, GameEditionsCacheRequest, UnifiedMetadata,
    SaveCoverRequest
)
from ..ia_service import ia_service
from ..dependencies import DB, CurrentUser
from ..services.metadata_service import MetadataService

logger = logging.getLogger("app.routers.ia")
router = APIRouter()

@router.get("/api/search_desc", summary="Recherche d'informations IA")
def search_desc(query: str, model: str = "gemini-flash-latest", user: CurrentUser = None):
    """
    Envoie une requête textuelle à l'IA (Gemini) pour extraire des informations
    sur un jeu. Tente de parser le résultat en JSON pour enrichir automatiquement
    les champs (YouTube, métadonnées). Retourne du texte brut en cas d'échec du parsing.
    """
    if not user: raise HTTPException(401)
    
    logger.info(f"Requête IA search_desc : model={model}, query='{query[:100]}...'")
    raw_result = ia_service.get_description(query, model)
    logger.debug(f"Résultat brut IA : {raw_result[:200]}...")
    
    # Tentative de parsing JSON pour extraction YouTube/Metadonnées
    try:
        # On cherche un bloc JSON si jamais l'IA a mis du texte autour
        clean_json = raw_result
        json_match = re.search(r'\{[\s\S]*\}', raw_result)
        if json_match:
            clean_json = json_match.group(0)
            
        data = json.loads(clean_json)
        logger.info(f"Parsing JSON réussi pour {query[:50]}")
        
        # Si c'est du JSON, on fait le traitement intelligent (YouTube, etc.)
        # On essaie de déterminer un titre pour la recherche YouTube
        search_query = query
        
        # Fallback regex sur la query si pas de titre dans le JSON
        match = re.search(r'Analyse le jeu vidéo "([^"]+)"', query)
        if match:
            search_query = match.group(1)

        if "title" in data and data["title"]:
            search_query = data["title"]
        elif "title_fr" in data and data["title_fr"]:
            search_query = data["title_fr"]
        elif "title_en" in data and data["title_en"]:
            search_query = data["title_en"]
        elif "editions" in data and data["editions"] and isinstance(data["editions"], list):
            search_query = data["editions"][0].get("title", search_query)

        # Recherche YouTube
        yt_links = ia_service.search_youtube_videos(search_query)
        
        if "youtube_urls" not in data or not isinstance(data["youtube_urls"], list):
            data["youtube_urls"] = []
        
        # Ajout des nouveaux liens sans doublons
        for link in yt_links:
            if link not in data["youtube_urls"]:
                data["youtube_urls"].append(link)

        # Propagation aux éditions
        if "editions" in data and isinstance(data["editions"], list):
            for ed in data["editions"]:
                if "youtube_urls" not in ed or not isinstance(ed["youtube_urls"], list):
                    ed["youtube_urls"] = []
                for link in data["youtube_urls"]:
                    if link not in ed["youtube_urls"]:
                        ed["youtube_urls"].append(link)

        return {"results": [{"body": json.dumps(data, ensure_ascii=False)}]}
        
    except Exception as e:
        # Ce n'est pas du JSON (ou format invalide), on retourne le texte brut
        # C'est typiquement le cas pour une simple demande de synopsis
        logger.info(f"Résultat IA non-JSON pour {query[:50]}... : retour en texte brut.")
        return {"results": [{"body": raw_result}]}

@router.get("/api/search_cover", summary="Rechercher des jaquettes")
def search_cover(query: str, user: CurrentUser = None):
    """
    Effectue une recherche d'images sur le web pour trouver des jaquettes
    correspondant au titre du jeu.
    """
    if not user: raise HTTPException(401)
    images = ia_service.search_images_list(query)
    if isinstance(images, dict) and "error" in images:
        raise HTTPException(500, detail=images["error"])
    return {"images": images}

@router.post("/api/save_cover", summary="Sauvegarder une jaquette")
async def save_cover(req: SaveCoverRequest, user: CurrentUser = None, db: DB = None):
    """
    Télécharge l'image depuis l'URL fournie et la sauvegarde comme 'cover.jpg'
    dans le dossier du jeu. Met également à jour la base de données.
    """
    if not user: raise HTTPException(401)
    folder_path = Path(req.folder_path)
    image_url = req.image_url
    if not folder_path.exists() or not image_url:
        raise HTTPException(400, detail="Paramètres invalides")
    
    try:
        response = requests.get(image_url, timeout=10)
        if response.status_code == 200:
            cover_path = folder_path / "cover.jpg"
            with open(cover_path, "wb") as f:
                f.write(response.content)
            
            # Synchronisation optionnelle avec la DB si nécessaire pour forcer le rafraîchissement
            if db:
                MetadataService.sync_to_db(folder_path, db, force=True)
                
            return {"ok": True}
        else:
            raise HTTPException(500, detail=f"Échec téléchargement image: {response.status_code}")
    except Exception as e:
        logger.error(f"Erreur lors de la sauvegarde de la couverture : {e}")
        raise HTTPException(500, detail=str(e))

@router.get("/api/img_proxy", summary="Proxy d'images")
def img_proxy(url: str, user: CurrentUser = None):
    """
    Sert d'intermédiaire pour charger des images provenant de domaines externes
    (pour contourner les problèmes de CORS ou de politique de sécurité).
    """
    if not user: raise HTTPException(401)
    try:
        resp = requests.get(url, stream=True, timeout=10)
        return StreamingResponse(resp.iter_content(chunk_size=1024), media_type=resp.headers.get("Content-Type"))
    except Exception as e:
        logger.error(f"Erreur proxy image : {e}")
        raise HTTPException(500, detail=str(e))

@router.post("/api/save_desc", summary="Sauvegarder le synopsis")
def save_desc(req: SaveDescRequest, user: CurrentUser, db: DB):
    """
    Met à jour manuellement ou via l'IA le résumé (synopsis) du jeu
    dans le fichier sidecar et la base de données.
    """
    if not user: raise HTTPException(401)
    folder_path = Path(req.folder_path)
    if not folder_path.exists(): raise HTTPException(404)

    meta = MetadataService.load_sidecar(folder_path) or UnifiedMetadata()
    meta.synopsis = req.text
    
    MetadataService.save_sidecar(folder_path, meta)
    MetadataService.sync_to_db(folder_path, db, force=True)
    return {"ok": True}

@router.post("/api/suggestions", summary="Obtenir des jeux similaires")
def get_suggestions(req: SuggestionRequest, user: CurrentUser, db: DB):
    """
    Demande à l'IA de proposer des jeux similaires ou de la même franchise
    en se basant sur le contexte actuel (titre, genre, éditeur).
    """
    if not user: raise HTTPException(401)
    folder_path = Path(req.folder_path)
    
    meta = MetadataService.load_sidecar(folder_path)
    if meta and meta.ai_suggestions_cache:
        return meta.ai_suggestions_cache

    result = ia_service.get_suggestions(
        req.game_title, meta_context={
            "title_fr": req.title_fr, "title_en": req.title_en,
            "publisher": req.publisher_orig, "date": req.publish_date,
            "system": req.rules_system, "setting": req.setting
        }
    )
    
    if result.get("status_ia") == "OK":
        if not meta: meta = UnifiedMetadata()
        meta.ai_suggestions_cache = result
        MetadataService.save_sidecar(folder_path, meta)
        MetadataService.sync_to_db(folder_path, db)

    return result

@router.post("/api/save_game_meta", summary="Sauvegarder les métadonnées unifiées")
def save_game_meta(req: GameMetaSaveRequest, user: CurrentUser, db: DB):
    """
    Point d'entrée principal pour sauvegarder l'intégralité des métadonnées techniques
    d'un jeu (développeurs, éditeurs, dates, tags, collection).
    Tout est persisté dans le fichier sidecar .metadata.json.
    """
    if not user: raise HTTPException(401)
    folder_path = Path(req.folder_path)
    logger.info(f"Requête de sauvegarde métadonnées pour : {folder_path.name}")
    
    meta = MetadataService.load_sidecar(folder_path) or UnifiedMetadata()

    logger.info(f"Sauvegarde métadonnées pour {req.folder_path}. Collection reçue: {req.family_name}")

    # Mapping des champs

    fields = [
        'title_fr', 'title_en', 'genre', 'keywords', 'release_date', 'universe', 
        'youtube_urls', 'steam_url', 'igdb_id', 'rating', 'is_archived', 
        'developer', 'studio', 'platform', 'publisher', 'tags', 'family_id'
    ]
    for field in fields:
        val = getattr(req, field, None)
        if val is not None: setattr(meta, field, val)
    
    if req.family_name is not None:
        meta.family = req.family_name

    if req.synopsis: meta.synopsis = req.synopsis

    MetadataService.save_sidecar(folder_path, meta)
    MetadataService.sync_to_db(folder_path, db, force=True)
    logger.info(f"Sauvegarde métadonnées réussie pour {folder_path.name}")
    return {"ok": True}

@router.post("/api/save_links", summary="Sauvegarder les liens externes")
def save_links(req: GameLinksRequest, user: CurrentUser, db: DB):
    """
    Sauvegarde la liste des liens de référence (Steam, IGDB, sites officiels) pour un jeu.
    """
    if not user: raise HTTPException(401)
    folder_path = Path(req.folder_path)
    logger.info(f"Requête de sauvegarde des liens ({len(req.links)}) pour : {folder_path.name}")
    
    meta = MetadataService.load_sidecar(folder_path) or UnifiedMetadata()
    meta.external_links = req.links
    
    MetadataService.save_sidecar(folder_path, meta)
    MetadataService.sync_to_db(folder_path, db, force=True)
    logger.info(f"Sauvegarde des liens réussie pour {folder_path.name}")
    return {"ok": True}

@router.post("/api/save_editions_cache", summary="Sauvegarder le cache des éditions")
def save_editions_cache(req: GameEditionsCacheRequest, user: CurrentUser, db: DB):
    """
    Sauvegarde les différentes versions/éditions d'un jeu trouvées par l'IA
    pour permettre une sélection ultérieure rapide.
    """
    if not user: raise HTTPException(401)
    folder_path = Path(req.folder_path)
    meta = MetadataService.load_sidecar(folder_path) or UnifiedMetadata()
    meta.editions_cache = req.editions
    
    MetadataService.save_sidecar(folder_path, meta)
    MetadataService.sync_to_db(folder_path, db, force=True)
    return {"ok": True}
