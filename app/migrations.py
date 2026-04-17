import sqlite3
import logging
from pathlib import Path
from .config import DB_FILENAME

logger = logging.getLogger(__name__)

def apply_migrations():
    """
    Applique manuellement les migrations SQLite pour ajouter les colonnes manquantes.
    SQLAlchemy's create_all() ne gère pas l'ajout de colonnes sur des tables existantes.
    """
    if not DB_FILENAME.exists():
        return

    columns_to_add = [
        ("game_meta", "title_fr"),
        ("game_meta", "title_en"),
        ("game_meta", "publisher_orig"),
        ("game_meta", "genre"),
        ("game_meta", "keywords"),
        ("game_meta", "publisher_fr"),
        ("game_meta", "publish_date"),
        ("game_meta", "rules_system"),
        ("game_meta", "setting"),
        ("game_meta", "authors"),
        ("game_meta", "artists")
    ]

    conn = sqlite3.connect(str(DB_FILENAME))
    cursor = conn.cursor()

    try:
        for table, column in columns_to_add:
            # Vérifier si la colonne existe
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [info[1] for info in cursor.fetchall()]
            
            if column not in columns:
                logger.info(f"Migration: Ajout de la colonne {column} à la table {table}")
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")
                print(f"✅ Migration: Colonne '{column}' ajoutée à '{table}'")
        
        conn.commit()
    except Exception as e:
        logger.error(f"Erreur lors des migrations : {e}")
        print(f"❌ Erreur migration : {e}")
    finally:
        conn.close()
