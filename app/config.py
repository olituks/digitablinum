import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

# --- PATHS ---
# On définit BASE_DIR de l'app (racine du projet /app dans le conteneur)
APP_ROOT = Path(__file__).parent.parent.absolute()
load_dotenv(APP_ROOT / ".env")

# --- API KEYS & SECURITY ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest").strip()

# --- AI PROMPTS (PC GAMES) ---
AI_PROMPT_METADATA = (os.getenv("AI_PROMPT_METADATA") or """
Tu es un expert en jeux vidéo PC. Analyse les informations suivantes sur un jeu et extrais les informations au format JSON pur :
{context_hint}
- title_fr : Titre français du jeu
- title_en : Titre original/anglais
- developers : Studio(s) de développement (ex: CD Projekt Red)
- studios : Studio(s) de développement (ex: Larian Studios)
- publishers : Éditeur(s) (ex: Bandai Namco)
- platforms : Plateformes supportées (ex: Windows, Linux, macOS, Steam Deck)
- genre : Genre(s) du jeu (ex: RPG, Action-Aventure)
- release_date : Date de sortie initiale (ex: 2023-08-03)
- universe : Univers ou thématique (ex: Cyberpunk, Fantasy)
- rating : Note moyenne ou attendue sur 100 (ex: 92)
- description : Un résumé court et percutant (3-4 phrases) du jeu.
- youtube_urls : Une liste d'URLs YouTube (une par ligne). Priorise les trailers officiels (Official Trailer), le gameplay ou des critiques/reviews (Game Review) de qualité, en français ou en anglais.

JSON :
""").strip()

AI_PROMPT_SUGGESTIONS = (os.getenv("AI_PROMPT_SUGGESTIONS") or "Expert Jeux Vidéo PC. Propose 5 jeux similaires ou de la même franchise pour '{game_title}'{context_str}. JSON pur: {{'status_ia': 'OK', 'suggestions': [{{'title': '...', 'lang': '...', 'desc': '...'}}]}}").strip()

AI_PROMPT_DESCRIPTIONS = (os.getenv("AI_PROMPT_DESCRIPTIONS") or "Expert Jeux Vidéo PC. Rédige une description concise et accrocheuse pour le jeu : {query}").strip()

AI_PROMPT_EDITIONS = (os.getenv("AI_PROMPT_EDITIONS") or """
Analyse le jeu vidéo "{game_title}". Identifie toutes les éditions ou versions majeures différentes (Standard, Gold, GOTY, Deluxe, Collector, Remastered, etc.) avec leurs années et plateformes respectives.
Retourne STRICTEMENT un objet JSON pur (pas de markdown) avec une clé "editions" contenant une liste d'objets. 
Chaque objet doit avoir : "display_name" (ex: "Deluxe Edition (2023)"), "title_fr", "title_en", "developer", "studio", "publisher", "genre", "release_date", "platform", "universe", "keywords", "rating", "youtube_urls", "description".
Pour "youtube_urls", fournis une liste d'URLs YouTube de trailers officiels, gameplay ou critiques (reviews), en français ou en anglais.
Assure-toi de trouver des données RÉELLES et de ne pas laisser de champs vides si possible.
""").strip()

AI_PROMPT_LINKS = (os.getenv("AI_PROMPT_LINKS") or """
Trouve les liens de référence pour le jeu vidéo "{title}". Retourne UNIQUEMENT un objet JSON pur (pas de markdown) avec une clé "links" qui est une liste d'objet {"name": "...", "url": "..."}. 
Inclus impérativement les liens vers : Steam, GOG, IGDB, Jeuxvideo.com, Gameblog, et le site officiel si possible.
Assure-toi que le JSON est valide et strictement conforme à la structure demandée.
""").strip()

SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_hex(32))
SERPER_API_KEY = os.getenv("SERPER_API_KEY", "").strip()

# --- OIDC (Authelia) ---
OIDC_ENABLED = os.getenv("OIDC_ENABLED", "False").lower() == "true"
OIDC_CLIENT_ID = os.getenv("OIDC_CLIENT_ID", "").strip()
OIDC_CLIENT_SECRET = os.getenv("OIDC_CLIENT_SECRET", "").strip()
OIDC_CONF_URL = os.getenv("OIDC_CONF_URL", "").strip()
OIDC_AUTH_METHOD = os.getenv("OIDC_AUTH_METHOD", "client_secret_basic").strip()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

# --- PATHS ---
BASE_DIR = Path("/bibliotheque")
HOST_GAMES_PATH = os.getenv("HOST_GAMES_PATH", str(BASE_DIR))
_env_db_dir = os.getenv("DB_DIR")
if _env_db_dir:
    DB_DIR = Path(_env_db_dir).absolute()
elif Path("/data").exists():
    DB_DIR = Path("/data")
else:
    DB_DIR = APP_ROOT / "data"

DB_DIR.mkdir(exist_ok=True)
BACKUP_DIR = DB_DIR / "backups"
BACKUP_DIR.mkdir(exist_ok=True)
THUMB_DIR = DB_DIR / "thumbnails"
THUMB_DIR.mkdir(exist_ok=True)
DB_FILENAME = DB_DIR / "pc_games.db"

SQLALCHEMY_DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL", f"sqlite:///{DB_FILENAME.absolute()}").replace("\\", "/")

# --- APP CONFIG ---
APP_VERSION = "2.5.8"
import sys
IS_TEST = 'pytest' in sys.modules or 'unittest' in sys.modules or os.getenv('PYTEST_CURRENT_TEST')
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO" if IS_TEST else "ERROR").upper()

ALLOWED_EXTENSIONS = {'.iso', '.rom', '.zip', '.mkv', '.mp4', '.exe'}
OPEN_METADATA_MODAL_FOR_NEW_GAME = os.getenv("OPEN_METADATA_MODAL_FOR_NEW_GAME", "True").lower() == "true"
ARCHIVE_DELETE_ORIGINALS = os.getenv("ARCHIVE_DELETE_ORIGINALS", "False").lower() == "true"
ARCHIVE_FORMAT = os.getenv("ARCHIVE_FORMAT", "iso").lower()
ISO_DOWNLOAD_ENABLED = os.getenv("ISO_DOWNLOAD_ENABLED", "False").lower() == "true"
GITHUB_REPO_URL = "https://github.com/olituks/digitablinum"
