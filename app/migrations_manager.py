import os
import logging
from pathlib import Path
from alembic.config import Config
from alembic import command
from alembic.util.exc import CommandError
from sqlalchemy import text, inspect
from .database import engine, Base
from .models import *
from .config import DB_FILENAME, SQLALCHEMY_DATABASE_URL

logger = logging.getLogger(__name__)

def check_table_consistency():
    """
    Vérifie si toutes les tables et colonnes critiques existent en base.
    Répare automatiquement les colonnes manquantes.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    expected_tables = set(Base.metadata.tables.keys())
    
    missing_tables = expected_tables - existing_tables
    
    # --- Réparation table 'game_meta' ---
    if "game_meta" in existing_tables:
        columns = [col['name'] for col in inspector.get_columns('game_meta')]
        essential_cols = {
            'sidecar_hash': 'VARCHAR',
            'editions_cache': 'TEXT',
            'youtube_urls': 'TEXT',
            'steam_url': 'VARCHAR',
            'rating': 'FLOAT',
            'release_date': 'VARCHAR',
            'universe': 'VARCHAR',
            'zip_status': 'VARCHAR DEFAULT "idle"',
            'zip_progress': 'INTEGER DEFAULT 0',
            'zip_path': 'VARCHAR',
            'zip_notified': 'BOOLEAN DEFAULT 0',
            'is_archived': 'BOOLEAN DEFAULT 0',
            'archived_files_json': 'TEXT',
            'family_id': 'INTEGER'
        }
        for col_name, col_type in essential_cols.items():
            if col_name not in columns:
                _add_column("game_meta", col_name, col_type)

    # --- Réparation table 'users' ---
    if "users" in existing_tables:
        columns = [col['name'] for col in inspector.get_columns('users')]
        user_cols = {
            'oidc_sub': 'VARCHAR UNIQUE',
            'last_seen': 'DATETIME',
            'must_change_password': 'BOOLEAN DEFAULT 0'
        }
        for col_name, col_type in user_cols.items():
            if col_name not in columns:
                _add_column("users", col_name, col_type)

    return list(missing_tables)

def _add_column(table_name, col_name, col_type):
    logger.warning(f"Colonne '{col_name}' manquante dans '{table_name}'. Tentative de réparation...")
    try:
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))
            conn.commit()
        logger.info(f"Colonne '{col_name}' ajoutée avec succès à '{table_name}'.")
    except Exception as e:
        logger.error(f"Erreur lors de l'ajout de la colonne {col_name} : {e}")

def setup_database():
    """
    Gère l'initialisation et les migrations de la base de données au démarrage.
    """
    migrations_path = Path("migrations")
    alembic_enabled = migrations_path.exists() and Path("alembic.ini").exists()

    if alembic_enabled:
        alembic_cfg = Config("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", SQLALCHEMY_DATABASE_URL)
    else:
        logger.info("Alembic n'est pas configuré (dossier 'migrations' absent). Mode direct SQLAlchemy.")

    db_exists = DB_FILENAME.exists()

    if not db_exists:
        logger.info("Base de données absente. Création initiale...")
        Base.metadata.create_all(bind=engine)
        if alembic_enabled:
            command.stamp(alembic_cfg, "head")
    else:
        if alembic_enabled:
            logger.info("Base de données existante. Application des migrations Alembic...")
            try:
                command.upgrade(alembic_cfg, "head")
            except CommandError as ce:
                if "Can't locate revision" in str(ce):
                    logger.warning("Révision incohérente, réinitialisation de la table de version...")
                    try:
                        with engine.connect() as conn:
                            conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
                            conn.commit()
                        command.stamp(alembic_cfg, "head")
                    except: pass
                else: raise ce
        else:
            logger.info("Base de données existante. Mode direct SQLAlchemy.")

    # Vérification et réparation automatique
    logger.info("Vérification de la cohérence des tables...")
    missing_tables = check_table_consistency()
    if missing_tables:
        Base.metadata.create_all(bind=engine)
        logger.info("Tables manquantes créées.")
    else:
        logger.info("Cohérence des tables OK.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    setup_database()
