from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, status, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from jose import jwt
from authlib.integrations.starlette_client import OAuth

from ..config import (
    SECRET_KEY, ALGORITHM, 
    OIDC_ENABLED, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_CONF_URL, OIDC_AUTH_METHOD
)
from ..database import get_db
from ..models import User
from ..auth import get_password_hash, verify_password
from ..dependencies import templates

router = APIRouter()

# --- Configuration OIDC ---
oauth = OAuth()
if OIDC_ENABLED:
    oauth.register(
        name='authelia',
        client_id=OIDC_CLIENT_ID,
        client_secret=OIDC_CLIENT_SECRET,
        server_metadata_url=OIDC_CONF_URL,
        client_kwargs={
            'scope': 'openid profile email',
            'timeout': 10.0,
        },
        token_endpoint_auth_method=OIDC_AUTH_METHOD
    )

@router.get("/login", response_class=HTMLResponse, summary="Page de connexion / Login Page")
def login_page(request: Request):
    """
    [FR] Affiche la page de connexion HTML.
    [EN] Displays the HTML login page.
    """
    return templates.TemplateResponse(request, "login.html", {
        "oidc_enabled": OIDC_ENABLED,
        "show_init_message": getattr(request.app.state, "show_init_message", False)
    })

@router.get("/login/oidc", summary="Connexion OIDC / OIDC Login")
async def login_oidc(request: Request):
    """
    [FR] Redirige l'utilisateur vers le fournisseur d'identité OIDC (ex: Authelia).
    [EN] Redirects the user to the OIDC identity provider (e.g., Authelia).
    """
    if not OIDC_ENABLED:
        raise HTTPException(status_code=404, detail="OIDC is not enabled")
    redirect_uri = request.url_for('auth_callback')
    # Force HTTPS if we are behind a proxy (typical for Authelia)
    if "http://" in str(redirect_uri) and request.headers.get("x-forwarded-proto") == "https":
        redirect_uri = str(redirect_uri).replace("http://", "https://")
    return await oauth.authelia.authorize_redirect(request, str(redirect_uri))

@router.get("/auth/callback", summary="Callback OIDC / OIDC Callback")
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    """
    [FR] Point de retour après authentification OIDC réussie. Gère la création ou liaison du compte local.
    [EN] Return point after successful OIDC authentication. Handles local account creation or linking.
    """
    if not OIDC_ENABLED:
        raise HTTPException(status_code=404, detail="OIDC is not enabled")
    
    token = await oauth.authelia.authorize_access_token(request)
    user_info = token.get('userinfo')
    if not user_info:
        return RedirectResponse("/login?error=oidc_failed", status_code=status.HTTP_303_SEE_OTHER)

    oidc_sub = user_info.get('sub')
    username = user_info.get('preferred_username') or user_info.get('name') or user_info.get('email')

    # Recherche de l'utilisateur par oidc_sub ou username
    user = db.query(User).filter(User.oidc_sub == oidc_sub).first()
    if not user:
        # Tenter de lier à un utilisateur existant par username (si pas déjà lié à un autre OIDC)
        user = db.query(User).filter(User.username == username, User.oidc_sub == None).first()
        if user:
            user.oidc_sub = oidc_sub
        else:
            # Créer un nouvel utilisateur
            role = "admin" if db.query(User).count() == 0 else "viewer"
            user = User(username=username, oidc_sub=oidc_sub, role=role)
            db.add(user)
        
        db.commit()
        db.refresh(user)

    # Génération du JWT interne
    jwt_token = jwt.encode(
        {"sub": user.username, "exp": datetime.now(timezone.utc) + timedelta(days=7)}, 
        SECRET_KEY, 
        algorithm=ALGORITHM
    )
    
    res = RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)
    res.set_cookie(key="access_token", value=f"Bearer {jwt_token}", httponly=True)
    return res

@router.post("/login", summary="Connexion locale / Local Login")
def login(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    """
    [FR] Authentifie un utilisateur via le formulaire local. Crée le premier admin si la base est vide.
    [EN] Authenticates a user via the local form. Creates the first admin if the database is empty.
    """
    user = db.query(User).filter(User.username == username).first()
    if not user and db.query(User).count() == 0:
        user = User(username=username, hashed_password=get_password_hash(password), role="admin")
        db.add(user)
        db.commit()
    
    if not user or not user.hashed_password or not verify_password(password, user.hashed_password):
        return RedirectResponse("/login?error=invalid", status_code=status.HTTP_303_SEE_OTHER)
    
    token = jwt.encode({"sub": user.username, "exp": datetime.now(timezone.utc) + timedelta(days=7)}, SECRET_KEY, algorithm=ALGORITHM)
    target_url = "/change-password-page" if user.must_change_password else "/"
    res = RedirectResponse(target_url, status_code=status.HTTP_303_SEE_OTHER)
    res.set_cookie(key="access_token", value=f"Bearer {token}", httponly=True)
    return res

@router.get("/logout", summary="Déconnexion / Logout")
def logout():
    """
    [FR] Déconnecte l'utilisateur en supprimant le cookie de session.
    [EN] Logs out the user by deleting the session cookie.
    """
    res = RedirectResponse("/login")
    res.delete_cookie("access_token")
    return res
