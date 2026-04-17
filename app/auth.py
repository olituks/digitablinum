from datetime import datetime, timedelta, timezone
from fastapi import Depends, Request
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from .config import SECRET_KEY, ALGORITHM
from .database import get_db
from .models import User

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("access_token")
    if not token:
        return None
    try:
        # Suppression du préfixe Bearer si présent
        token_str = token.replace("Bearer ", "")
        payload = jwt.decode(token_str, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        return None
    
    user = db.query(User).filter(User.username == username).first()
    if user:
        # Mise à jour de la dernière apparition (non bloquant et résilient)
        try:
            now = datetime.now(timezone.utc).replace(tzinfo=None) # Stockage en naïf UTC pour SQLAlchemy
            if not user.last_seen or (now - user.last_seen).total_seconds() > 300:
                user.last_seen = now
                db.commit()
        except Exception:
            db.rollback() # Éviter de bloquer l'auth si l'update de last_seen échoue
            
    return user
