import logging
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import SQLALCHEMY_DATABASE_URL

logger = logging.getLogger(__name__)
logger.info(f"Configuration de la base de données : {SQLALCHEMY_DATABASE_URL}")

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    # Log de la connexion pour débogage
    logger.info(f"Connexion à la base de données SQLite établie.")
    
    cursor = dbapi_connection.cursor()
    # DELETE mode est plus compatible avec les montages réseau (NAS) que WAL
    cursor.execute("PRAGMA journal_mode=DELETE;")
    # FULL assure une meilleure intégrité sur les systèmes de fichiers distants
    cursor.execute("PRAGMA synchronous=FULL;")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
