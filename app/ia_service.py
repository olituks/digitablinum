import json
import requests
import logging
import re
from typing import List, Optional, Dict, Union
from . import config

logger = logging.getLogger(__name__)

class AIService:
    def __init__(self):
        self.api_key = config.GEMINI_API_KEY
        self.serper_api_key = config.SERPER_API_KEY
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"
        self.default_model = config.GEMINI_MODEL

    def search_youtube_videos(self, game_title: str) -> List[str]:
        """Recherche de vraies vidéos YouTube via Serper (Trailer et Review)."""
        if not self.serper_api_key:
            return []

        videos = []
        # On fait deux recherches distinctes pour maximiser la pertinence
        queries = [f"{game_title} official trailer", f"{game_title} gameplay review french or english"]
        
        for q in queries:
            try:
                url = "https://google.serper.dev/search"
                payload = {"q": q, "num": 3} # On prend les 3 premiers pour filtrer
                headers = {'X-API-KEY': self.serper_api_key, 'Content-Type': 'application/json'}
                r = requests.post(url, headers=headers, json=payload, timeout=10)
                if r.status_code == 200:
                    results = r.json().get("organic", [])
                    for res in results:
                        link = res.get("link", "")
                        if "youtube.com/watch?v=" in link or "youtu.be/" in link:
                            # Extraction simple de l'ID pour validation
                            vid_id = self._extract_youtube_id(link)
                            if vid_id and self.is_youtube_video_available(vid_id):
                                videos.append(link)
                                break # On prend la meilleure vidéo pour cette requête
            except Exception as e:
                logger.error(f"Erreur recherche YouTube Serper ({q}): {e}")
        
        return list(dict.fromkeys(videos)) # Dédoublonnage

    def _extract_youtube_id(self, url: str) -> Optional[str]:
        """Helper interne pour extraire l'ID vidéo."""
        regExp = r'^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*'
        match = re.match(regExp, url)
        return match.group(2) if match and len(match.group(2)) == 11 else None

    def is_youtube_video_available(self, video_id: str) -> bool:
        """Vérifie si une vidéo YouTube est réellement disponible (pas privée ou supprimée)."""
        if not video_id: return False
        try:
            # On vérifie l'existence de la miniature oEmbed, c'est l'indicateur le plus fiable sans clé API Data
            url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
            r = requests.get(url, timeout=5)
            return r.status_code == 200
        except:
            return False

    def _generate_content(self, prompt: str, model: Optional[str] = None, lang: Optional[str] = None) -> str:
        target_model = model or self.default_model
        # Sécurité sur le nom du modèle
        target_model = re.sub(r'[^a-zA-Z0-9\.\-_]', '', target_model)
        
        # Injection de la consigne de langue si fournie
        if lang:
            lang_name = "French" if lang == 'fr' else "English"
            prompt = f"Target Language: {lang_name}\n\n{prompt}"

        url = f"{self.base_url}/{target_model}:generateContent?key={self.api_key}"
        try:
            r = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=60)
            
            if r.status_code != 200:
                err_msg = f"Gemini API Error {r.status_code}: {r.text}"
                logger.error(f"[IA] {err_msg}")
                raise Exception(err_msg)

            try:
                data = r.json()
            except Exception as json_e:
                err_msg = f"Failed to parse Gemini JSON response: {json_e}"
                logger.error(f"[IA] {err_msg}")
                raise Exception(err_msg)

            candidates = data.get("candidates", [])
            if candidates and len(candidates) > 0:
                candidate = candidates[0]
                content = candidate.get("content", {})
                parts = content.get("parts", [])
                if parts and len(parts) > 0:
                    text = parts[0].get("text", "")
                    if text:
                        return text
                
                # Log de la raison de fin si le texte est vide
                finish_reason = candidate.get("finishReason")
                if finish_reason:
                    err_msg = f"Gemini a terminé sans texte. Raison : {finish_reason}"
                    logger.warning(f"[IA] {err_msg}")
                    return f"ERREUR_IA: {err_msg}"
            
            # Si on arrive ici, l'IA n'a pas renvoyé de réponse exploitable (ex: filtrage)
            err_msg = f"Gemini a renvoyé une réponse vide ou filtrée pour {target_model}."
            logger.warning(f"[IA] {err_msg} Structure : {json.dumps(data)}")
            return f"ERREUR_IA: {err_msg}"
        except Exception as e:
            if "Gemini API Error" in str(e) or "Failed to parse" in str(e):
                raise
            logger.error(f"[IA] Erreur critique lors de l'appel Gemini ({target_model}): {e}")
            raise Exception(f"Erreur connexion Gemini : {str(e)}")

    def get_suggestions(self, game_title: str, exclude_titles: List[str] = None, meta_context: Dict = None, lang: Optional[str] = None) -> Dict:
        exclude_str = f"\nEXCLUS : {', '.join(exclude_titles)}" if exclude_titles else ""
        
        context_str = ""
        if meta_context:
            title = meta_context.get("title_fr") or meta_context.get("title_en") or game_title
            pub = meta_context.get("publisher") or ""
            date = meta_context.get("date") or ""
            sys = meta_context.get("system") or ""
            set_ = meta_context.get("setting") or ""
            if pub or date or sys or set_:
                context_str = f" (Édition : {title}, par {pub} en {date}, système {sys}, univers {set_})"

        prompt = config.AI_PROMPT_SUGGESTIONS.format(game_title=game_title, context_str=context_str) + exclude_str
        try:
            raw = self._generate_content(prompt, lang=lang)
            clean = raw.replace("```json", "").replace("```", "").strip()
            data = json.loads(clean)
            for item in data.get("suggestions", []):
                res = self.search_images_list(f"{item['title']} cover", num=1)
                item["image"] = res[0] if isinstance(res, list) and res else ""
            return data
        except Exception as e:
            logger.error(f"Erreur suggestions: {e}")
            return {"status_ia": "Erreur", "suggestions": []}

    def search_images_list(self, query: str, num: int = 10) -> Union[List[str], Dict]:
        """Recherche d'images via Serper.dev (Google Search API alternative)."""
        if not self.serper_api_key:
            return {"error": "Clé Serper.dev manquante"}

        url = "https://google.serper.dev/images"
        payload = {
            "q": query,
            "num": num
        }
        headers = {
            'X-API-KEY': self.serper_api_key,
            'Content-Type': 'application/json'
        }
        
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=10)
            if r.status_code != 200:
                return {"error": f"Serper API {r.status_code}", "details": r.json()}

            data = r.json()
            # Serper retourne les URLs dans le champ 'imageUrl'
            return [img.get("imageUrl", "") for img in data.get("images", [])]
        except Exception as e:
            logger.error(f"Erreur Serper: {e}")
            return {"error": str(e)}

    def get_description(self, query: str, model: Optional[str] = None, lang: Optional[str] = None) -> str:
        return self._generate_content(query, model, lang=lang)

    def extract_metadata_from_text(self, text: str, folder_name: Optional[str] = None, lang: Optional[str] = None) -> Dict:
        """Analyse le texte d'un jeu pour extraire les métadonnées."""
        context_hint = ""
        if folder_name:
            context_hint = f"\nIMPORTANT : Le dossier contenant ce livre s'appelle '{folder_name}'. C'est une indication forte sur le titre du jeu.\n"

        prompt = config.AI_PROMPT_METADATA.format(context_hint=context_hint, text=text[:4000])
        
        try:
            raw = self._generate_content(prompt, lang=lang)
            clean = raw.replace("```json", "").replace("```", "").strip()
            # On tente de trouver le premier { et le dernier }
            start = clean.find('{')
            end = clean.rfind('}') + 1
            if start != -1 and end != 0:
                clean = clean[start:end]
            return json.loads(clean)
        except Exception as e:
            logger.error(f"Erreur extraction métadonnées: {e}")
            return {
                "title_fr": None,
                "title_en": None,
                "publisher": None,
                "system": None,
                "setting": None,
                "description": "Erreur lors de l'analyse automatique."
            }

    def list_models(self) -> List[str]:
        url = f"{self.base_url}?key={self.api_key}"
        try:
            r = requests.get(url, timeout=10)
            return [m['name'].split('/')[-1] for m in r.json().get('models', []) if 'generateContent' in m.get('supportedGenerationMethods', [])]
        except: return [self.default_model]

ia_service = AIService()
