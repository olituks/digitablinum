from typing import Annotated, Optional
from contextvars import ContextVar
from fastapi import Request, Depends, HTTPException
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from .config import APP_VERSION, GITHUB_REPO_URL
from .i18n_service import i18n_service
from .database import get_db
from .models import User
from .auth import get_current_user

# ContextVar to store the current language for the request
current_lang: ContextVar[str] = ContextVar("current_lang", default="fr")

templates = Jinja2Templates(directory="templates")
templates.env.globals["APP_VERSION"] = APP_VERSION
templates.env.globals["GITHUB_REPO_URL"] = GITHUB_REPO_URL

# --- DEPENDENCY TYPES (Annotated) ---
DB = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[Optional[User], Depends(get_current_user)]

async def get_admin_user(user: CurrentUser) -> User:
    """Dépendance qui garantit que l'utilisateur est un admin."""
    if not user:
        raise HTTPException(status_code=401, detail="Non authentifié")
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé : Admin requis")
    return user

AdminUser = Annotated[User, Depends(get_admin_user)]

# --- I18N HELPERS ---
def jinja_gettext(key: str, **kwargs) -> str:
    lang = current_lang.get()
    return i18n_service.get_text(key, lang, **kwargs)

templates.env.globals["_"] = jinja_gettext
templates.env.globals["get_current_lang"] = lambda: current_lang.get()
templates.env.globals["get_all_translations"] = lambda: i18n_service.get_all_translations(current_lang.get())

def get_language(request: Request) -> str:
    lang = request.cookies.get("lang")
    if lang: return lang
    
    accept_lang = request.headers.get("accept-language")
    if accept_lang:
        return accept_lang.split(",")[0].split("-")[0].lower()
    return "fr"

def get_text_wrapper(request: Request):
    lang = get_language(request)
    return lambda key: i18n_service.get_text(key, lang)
