import hashlib
import functools
import unicodedata
import re
import json
import shutil
import os
import logging
import zipfile
import anyio
import subprocess
import io
import time
import select
try:
    import pycdlib
except ImportError:
    pycdlib = None
from pathlib import Path
from urllib.parse import quote
from typing import Optional, Union, Dict
from datetime import datetime
from sqlalchemy import text
from .config import BASE_DIR, THUMB_DIR, BACKUP_DIR, DB_FILENAME, ARCHIVE_FORMAT
from .schemas import UnifiedMetadata

logger = logging.getLogger(__name__)

def get_system_config(db_session, key: str, default: Optional[str] = None) -> Optional[str]:
    """Récupère une valeur de configuration globale depuis la table system_config."""
    from .models import SystemConfig
    config = db_session.query(SystemConfig).filter(SystemConfig.key == key).first()
    return config.value if config else default

def set_system_config(db_session, key: str, value: str):
    """Définit ou met à jour une valeur de configuration globale."""
    from .models import SystemConfig
    config = db_session.query(SystemConfig).filter(SystemConfig.key == key).first()
    if config:
        config.value = value
    else:
        config = SystemConfig(key=key, value=value)
        db_session.add(config)
    db_session.commit()

def create_db_backup() -> Optional[str]:
    """
    Crée une copie de sauvegarde de la base de données SQLite.
    Format: backup_YYYYMMDD_HHMMSS.db
    """
    if not DB_FILENAME.exists():
        logger.warning(f"Impossible de sauvegarder la DB : fichier introuvable {DB_FILENAME}")
        return None
        
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"backup_{timestamp}.db"
    backup_p = BACKUP_DIR / backup_name
    
    try:
        shutil.copy2(DB_FILENAME, backup_p)
        logger.info(f"Sauvegarde de la base de données réussie : {backup_p.name}")
        return backup_name
    except Exception as e:
        logger.error(f"Erreur lors de la sauvegarde de la base de données : {e}")
        return None

def rotate_backups(max_backups: int = 5):
    """
    Supprime les anciennes sauvegardes pour ne garder que les X plus récentes.
    """
    try:
        backups = sorted(
            [f for f in BACKUP_DIR.glob("backup_*.db")],
            key=os.path.getmtime,
            reverse=True
        )
        
        if len(backups) > max_backups:
            to_delete = backups[max_backups:]
            for f in to_delete:
                logger.info(f"Rotation des sauvegardes : suppression de {f.name}")
                f.unlink()
    except Exception as e:
        logger.error(f"Erreur lors de la rotation des sauvegardes : {e}")

def normalize_path(path: Union[Path, str]) -> str:
    """Normalise un chemin en chaîne de caractères avec des slashes forward, même on Windows."""
    return str(path).replace("\\", "/")

def load_unified_metadata(folder_path: Path) -> Optional[UnifiedMetadata]:
    """Charge le fichier .metadata.json s'il existe. Résilient aux données parasites en fin de fichier."""
    metadata_p = folder_path / ".metadata.json"
    if not metadata_p.exists():
        return None
    try:
        content = metadata_p.read_text(encoding='utf-8')
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            # Fallback : tentative d'extraction du premier objet JSON complet
            logger.debug(f"Erreur parsing JSON standard pour {metadata_p}, tentative de récupération...")
            start = content.find('{')
            end = content.rfind('}')
            success_fallback = False
            if start != -1 and end != -1 and end > start:
                clean_content = content[start:end+1]
                try:
                    data = json.loads(clean_content)
                    logger.warning(f"Fichier {metadata_p} récupéré malgré des données parasites en fin de fichier.")
                    success_fallback = True
                except Exception as fallback_err:
                    logger.error(f"Échec de la récupération (fallback) pour {metadata_p}: {fallback_err}")
            
            if not success_fallback:
                # Création d'un fichier de debug si l'échec est total
                error_file_p = folder_path / ".metadata.error.json"
                try:
                    error_file_p.write_text(content, encoding='utf-8')
                    logger.info(f"Fichier de debug créé pour analyse : {error_file_p}")
                except OSError as os_err:
                    if os_err.errno == 30: # Read-only file system
                        logger.warning(f"Système en lecture seule : impossible de créer le fichier de debug {error_file_p}")
                    else:
                        logger.error(f"Erreur lors de la création du fichier de debug {error_file_p}: {os_err}")
                raise e
        return UnifiedMetadata(**data)
    except Exception as e:
        logger.error(f"Erreur lors du chargement de {metadata_p}: {e}")
        return None

def has_sidecar_metadata(folder_path: Path) -> bool:
    """Vérifie si le fichier .metadata.json existe dans le dossier."""
    return (folder_path / ".metadata.json").exists()

def save_game_cover(folder_path: Path, content: bytes) -> bool:
    """
    Sauvegarde le contenu de l'image de couverture.
    Tente de l'écrire dans le dossier du jeu. Si RO, écrit dans le cache.
    """
    dest = folder_path / "cover.jpg"
    try:
        with open(dest, 'wb') as f:
            f.write(content)
        return True
    except OSError as e:
        if e.errno == 30: # Read-only file system
            game_hash = hashlib.md5(str(folder_path).encode()).hexdigest()
            cache_path = THUMB_DIR / f"{game_hash}_cover.jpg"
            try:
                with open(cache_path, 'wb') as f:
                    f.write(content)
                logger.info(f"Système RO: couverture sauvegardée dans {cache_path}")
                return True
            except Exception as e2:
                logger.error(f"Erreur sauvegarde cache couverture: {e2}")
                return False
        else:
            logger.error(f"Erreur sauvegarde couverture dans {dest}: {e}")
            return False
    except Exception as e:
        logger.error(f"Erreur inattendue sauvegarde couverture: {e}")
        return False

def get_game_thumbnail_url(folder_path: Path) -> Optional[Union[str, Dict[str, str]]]:
    """Récupère l'URL de la couverture optimisée pour la galerie."""
    from .services.image_service import ImageService
    optimized = ImageService.get_optimized_url(folder_path, usage="gallery")
    if optimized:
        return optimized
        
    # Fallback si ImageService échoue
    cover_names = ["cover.jpg", "cover.png", "folder.jpg", "cover.webp"]
    for img in cover_names:
        p = folder_path / img
        if p.exists():
            stat = p.stat()
            return f"{get_file_url(p)}?t={int(stat.st_mtime)}"
    
    return None

def _normalize(text: str) -> str:
    """Normalise un titre/nom de fichier pour comparaison floue."""
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    text = re.sub(r'[^a-z0-9\s]', ' ', text.lower())
    return ' '.join(text.split())

@functools.lru_cache(maxsize=1024)
def _cached_file_hash(path_str: str, st_size: int, st_mtime: float):
    h = hashlib.md5()
    try:
        with open(path_str, 'rb') as f:
            if st_size < 1024 * 1024: # < 1MB
                h.update(f.read())
            else:
                chunk = f.read(8192)
                h.update(chunk)
                f.seek(0, 2)
                h.update(str(f.tell()).encode())
        return h.hexdigest()
    except:
        return None

def calculate_file_hash(file_path: Path):
    if not file_path.exists(): return None
    try:
        stat = file_path.stat()
        return _cached_file_hash(str(file_path), stat.st_size, stat.st_mtime)
    except Exception as e:
        logger.error(f"Erreur calcul hash pour {file_path}: {e}")
        return None

def format_size(size_bytes: int) -> str:
    """Transforme des octets en une chaîne lisible (Ko, Mo, Go, To)."""
    if size_bytes == 0: return "0 o"
    units = ("o", "Ko", "Mo", "Go", "To")
    import math
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {units[i]}"

def get_file_url(file_path: Path) -> str:
    try:
        rel = file_path.relative_to(BASE_DIR)
        return f"/library/{quote(str(rel))}"
    except:
        return ""

def investigate_archive(archive_path: Path):
    """
    Explore une archive (.zip ou .iso) et retourne la liste des fichiers.
    Stratégie : Fallback 7z (UDF/Gros ISO) -> pycdlib (ISO standards) -> zipfile.
    """
    results = []
    suffix = archive_path.suffix.lower()

    # 1. TENTATIVE VIA 7Z (Plus robuste pour UDF et Gros fichiers)
    try:
        cmd = ["7z", "l", "-slt", str(archive_path)]
        process = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if process.returncode == 0:
            current = {}
            for line in process.stdout.splitlines():
                line = line.strip()
                if line.startswith("Path = ") and "path" not in current:
                    current["path"] = line[7:].strip().replace("\\", "/")
                elif line.startswith("Attributes = "):
                    current["is_dir"] = "D" in line[13:]
                elif line.startswith("Size = "):
                    try: current["size"] = int(line[7:].strip())
                    except: current["size"] = 0
                elif line == "" and current:
                    if not current.get("is_dir") and current.get("path") and current["path"] != archive_path.name:
                        filename = current["path"].split("/")[-1]
                        rel_path = current["path"]
                        
                        nfo_content = ""
                        if filename.lower().endswith(".nfo"):
                            try:
                                extract_cmd = ["7z", "e", "-so", str(archive_path), rel_path]
                                ext_proc = subprocess.run(extract_cmd, capture_output=True, timeout=20)
                                if ext_proc.returncode == 0:
                                    for enc in ['cp437', 'utf-8', 'latin-1']:
                                        try:
                                            nfo_content = ext_proc.stdout.decode(enc)
                                            break
                                        except: continue
                            except: pass

                        results.append({
                            "archive": archive_path.name,
                            "filename": filename,
                            "rel_path": rel_path,
                            "size_mb": round(current.get("size", 0) / 1024 / 1024, 2),
                            "nfo_content": nfo_content
                        })
                    current = {}
            
            if current and not current.get("is_dir") and current.get("path") and current["path"] != archive_path.name:
                filename = current["path"].split("/")[-1]
                results.append({
                    "archive": archive_path.name,
                    "filename": filename,
                    "rel_path": current["path"],
                    "size_mb": round(current.get("size", 0) / 1024 / 1024, 2),
                    "nfo_content": ""
                })

            if results:
                logger.info(f"Investigation via 7z réussie pour {archive_path.name} ({len(results)} fichiers)")
                return results
    except Exception as e:
        logger.debug(f"7z non disponible ou erreur sur {archive_path.name}: {e}")

    # 2. TENTATIVE VIA PYCDLIB (Pour ISO standards si 7z échoue)
    if suffix == '.iso' and pycdlib:
        try:
            iso = pycdlib.PyCdlib()
            try:
                iso.open(str(archive_path))
            except:
                return []

            mode = 'joliet' if iso.has_joliet() else 'rock_ridge' if iso.has_rock_ridge() else 'udf' if iso.has_udf() else 'iso_path'

            for root, dirs, files in iso.walk(**{mode: '/'}):
                for file in files:
                    iso_path = (Path(root) / file).as_posix()
                    try:
                        if mode == 'joliet': file_info = iso.get_file_from_joliet_path(iso_path)
                        elif mode == 'rock_ridge': file_info = iso.get_file_from_rock_ridge_path(iso_path)
                        elif mode == 'udf': file_info = iso.get_file_from_udf_path(iso_path)
                        else: file_info = iso.get_file_from_iso_path(iso_path)
                        
                        nfo_content = ""
                        if file.lower().endswith('.nfo'):
                            try:
                                kwargs = {}
                                if mode == 'joliet': kwargs['joliet_path'] = iso_path
                                elif mode == 'rock_ridge': kwargs['rr_path'] = iso_path
                                elif mode == 'udf': kwargs['udf_path'] = iso_path
                                else:
                                    kwargs['iso_path'] = iso_path.upper()
                                    if not kwargs['iso_path'].endswith(';1'): kwargs['iso_path'] += ';1'

                                extracted = io.BytesIO()
                                iso.get_file_from_iso_fp(extracted, **kwargs)
                                raw = extracted.getvalue()
                                for enc in ['cp437', 'utf-8', 'latin-1']:
                                    try:
                                        nfo_content = raw.decode(enc)
                                        break
                                    except: continue
                            except Exception as e:
                                logger.debug(f"Lecture NFO pycdlib échouée ({iso_path}): {e}")

                        results.append({
                            "archive": archive_path.name, "filename": file, "rel_path": iso_path.lstrip('/'),
                            "size_mb": round(file_info.get_size() / 1024 / 1024, 2), "nfo_content": nfo_content
                        })
                    except: continue
            iso.close()
            return results
        except Exception as e:
            logger.error(f"Échec total investigation ISO {archive_path.name}: {e}")

    # 3. TENTATIVE VIA ZIPFILE (Pour ZIP standard si 7z échoue)
    if suffix == '.zip':
        try:
            with zipfile.ZipFile(archive_path, 'r') as zf:
                for info in zf.infolist():
                    if info.is_dir(): continue
                    nfo_content = ""
                    if info.filename.lower().endswith('.nfo'):
                        for enc in ['cp437', 'utf-8', 'latin-1']:
                            try:
                                with zf.open(info) as f: nfo_content = f.read().decode(enc)
                                break
                            except: continue
                    results.append({
                        "archive": archive_path.name, "filename": Path(info.filename).name,
                        "rel_path": info.filename.replace("\\", "/"), "size_mb": round(info.file_size / 1024 / 1024, 2),
                        "nfo_content": nfo_content
                    })
            return results
        except: pass

    return results

def get_cover_url_with_timestamp(folder_path: Path) -> Optional[Union[str, Dict[str, str]]]:
    """Récupère l'URL de la couverture optimisée pour la fiche jeu."""
    from .services.image_service import ImageService
    optimized = ImageService.get_optimized_url(folder_path, usage="view")
    if optimized:
        return optimized

    # Fallback
    for img in ["cover.jpg", "cover.png", "folder.jpg", "cover.webp"]:
        p = folder_path / img
        if p.exists():
            return f"{get_file_url(p)}?t={int(p.stat().st_mtime)}"
    return None

def make_iso_sync(source_path: Path, dest_path: Path, volume_name: str, excludes: list = None, progress_callback: callable = None):
    cmd = ["genisoimage", "-o", str(dest_path), "-R", "-J", "-joliet-long", "-allow-limited-size", "-V", volume_name[:31]]
    if excludes:
        for x in excludes: cmd.extend(["-exclude", x])
    cmd.append(str(source_path))
    
    process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, bufsize=1, universal_newlines=True)
    full_stderr = []
    progress_re = re.compile(r"([\d.]+)%\s+done")
    last_activity = time.time()
    while True:
        if time.time() - last_activity > 360:
            process.kill()
            raise TimeoutError("Timeout: aucune progression depuis 360 secondes.")
        if process.poll() is not None: break
        line = None
        try:
            rlist, _, _ = select.select([process.stderr], [], [], 1.0)
            if rlist: line = process.stderr.readline()
        except:
            time.sleep(0.1)
            continue
        if line:
            full_stderr.append(line)
            last_activity = time.time()
            if progress_callback:
                match = progress_re.search(line)
                if match:
                    try: progress_callback(int(float(match.group(1))))
                    except: pass
    for line in iter(process.stderr.readline, ""): full_stderr.append(line)
    if process.wait() != 0: raise Exception(f"Erreur genisoimage: {''.join(full_stderr)}")
    return str(dest_path)

async def create_folder_iso(target_path: Path, db_session=None):
    from .models import GameMeta
    from .database import SessionLocal
    if not target_path.exists() or not target_path.is_dir(): raise Exception(f"Dossier introuvable: {target_path}")
    internal_session = False
    if db_session is None:
        db_session = SessionLocal()
        internal_session = True
    try:
        parent_path = target_path.parent
        db_meta = db_session.query(GameMeta).filter(GameMeta.folder_path == normalize_path(parent_path.absolute())).first()
        if db_meta:
            db_meta.zip_status = "processing"
            db_meta.zip_progress = 0
            db_session.commit()
        iso_path = target_path.parent / (target_path.name + '.iso')
        def _cb(pct):
            if db_meta:
                try:
                    db_session.refresh(db_meta)
                    db_meta.zip_progress = pct
                    db_session.commit()
                except: pass
        await anyio.to_thread.run_sync(make_iso_sync, target_path, iso_path, target_path.name, None, _cb)
        backup_dir = target_path.parent / ".backup"
        backup_dir.mkdir(exist_ok=True)
        dest_p = backup_dir / target_path.name
        if dest_p.exists():
            if dest_p.is_dir(): shutil.rmtree(dest_p)
            else: dest_p.unlink()
        shutil.move(str(target_path), str(dest_p))
        if db_meta:
            db_meta.zip_status = "ready"
            db_meta.zip_progress = 100
            db_meta.zip_path = normalize_path(iso_path)
            db_meta.zip_notified = False
            db_session.commit()
        return str(iso_path)
    except Exception as e:
        if db_meta:
            db_meta.zip_status = "error"
            db_session.commit()
        raise
    finally:
        if internal_session: db_session.close()

async def create_game_iso(folder_path: Path, db_session, archive_mode: bool = False):
    from .models import GameMeta
    from .database import SessionLocal
    from .config import ARCHIVE_DELETE_ORIGINALS
    internal_session = False
    try: db_session.execute(text("SELECT 1"))
    except:
        db_session = SessionLocal()
        internal_session = True
    try:
        db_meta = db_session.query(GameMeta).filter(GameMeta.folder_path == normalize_path(folder_path)).first()
        if not db_meta: return
        db_meta.zip_status = "processing"
        db_meta.zip_progress = 0
        db_session.commit()
        iso_name = f"{folder_path.name}.iso"
        iso_p = folder_path / iso_name
        def _cb(pct):
            try:
                db_session.refresh(db_meta)
                db_meta.zip_progress = pct
                db_session.commit()
            except: pass
        file_index = []
        all_files = []
        if archive_mode:
            for root, dirs, files in os.walk(folder_path):
                for file in files:
                    if file in [iso_name, f"{folder_path.name}.zip", '.metadata.json', 'cover.jpg', 'cover.png', 'folder.jpg', 'cover.webp']: continue
                    full_p = Path(root) / file
                    all_files.append(full_p)
                    file_index.append({"archive": iso_name, "filename": file, "rel_path": str(full_p.relative_to(folder_path)).replace("\\", "/"), "size_mb": round(full_p.stat().st_size / 1024 / 1024, 2)})
        await anyio.to_thread.run_sync(make_iso_sync, folder_path, iso_p, folder_path.name, [iso_name, ".metadata.json", "cover.jpg", "cover.png", "folder.jpg", "cover.webp"], _cb)
        db_meta.zip_status = "ready"
        db_meta.zip_progress = 100
        db_meta.zip_path = normalize_path(iso_p)
        db_meta.zip_notified = False
        if archive_mode and file_index:
            db_meta.is_archived = True
            db_meta.archived_files_json = json.dumps(file_index, ensure_ascii=False)
            backup_dir = folder_path / ".backup"
            backup_dir.mkdir(exist_ok=True)
            for f_p in all_files:
                if f_p.exists():
                    rel_p = f_p.relative_to(folder_path)
                    dest_p = backup_dir / rel_p
                    dest_p.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(f_p), str(dest_p))
            for root, dirs, files in os.walk(folder_path, topdown=False):
                if ".backup" in root: continue
                for d in dirs:
                    d_p = Path(root) / d
                    if d_p.exists() and d_p.is_dir() and not any(d_p.iterdir()):
                        try: d_p.rmdir()
                        except: pass
            if ARCHIVE_DELETE_ORIGINALS: shutil.rmtree(backup_dir, ignore_errors=True)
        db_session.commit()
    except Exception as e:
        if db_meta:
            db_meta.zip_status = "error"
            db_session.commit()
    finally:
        if internal_session: db_session.close()

async def create_game_zip(folder_path: Path, db_session, archive_mode: bool = False):
    if ARCHIVE_FORMAT == "iso": return await create_game_iso(folder_path, db_session, archive_mode)
    from .models import GameMeta
    from .database import SessionLocal
    from .config import ARCHIVE_DELETE_ORIGINALS
    internal_session = False
    try: db_session.execute(text("SELECT 1"))
    except:
        db_session = SessionLocal()
        internal_session = True
    try:
        db_meta = db_session.query(GameMeta).filter(GameMeta.folder_path == normalize_path(folder_path)).first()
        if not db_meta: return
        db_meta.zip_status = "processing"
        db_meta.zip_progress = 0
        db_session.commit()
        zip_name = f"{folder_path.name}.zip"
        zip_p = folder_path / zip_name
        def _do_zip():
            all_files = []
            file_index = []
            for root, dirs, files in os.walk(folder_path):
                for file in files:
                    if file == zip_name or file == f"{folder_path.name}.iso" or file == '.metadata.json' or file in ['cover.jpg', 'cover.png', 'folder.jpg', 'cover.webp']: continue
                    full_p = Path(root) / file
                    all_files.append(full_p)
                    if archive_mode:
                        file_index.append({"archive": zip_name, "filename": file, "rel_path": str(full_p.relative_to(folder_path)).replace("\\", "/"), "size_mb": round(full_p.stat().st_size / 1024 / 1024, 2)})
            if not all_files: return []
            with zipfile.ZipFile(zip_p, 'w', zipfile.ZIP_DEFLATED) as zf:
                for i, file_p in enumerate(all_files):
                    zf.write(file_p, file_p.relative_to(folder_path))
                    pct = int(((i + 1) / len(all_files)) * 100)
                    db_meta.zip_progress = pct
                    db_session.commit()
            return file_index
        file_index = await anyio.to_thread.run_sync(_do_zip)
        db_meta.zip_status = "ready"
        db_meta.zip_progress = 100
        db_meta.zip_path = normalize_path(zip_p)
        db_meta.zip_notified = False
        if archive_mode and file_index:
            db_meta.is_archived = True
            db_meta.archived_files_json = json.dumps(file_index, ensure_ascii=False)
            if ARCHIVE_DELETE_ORIGINALS:
                for root, dirs, files in os.walk(folder_path, topdown=False):
                    for file in files:
                        if file != zip_name and file != f"{folder_path.name}.iso" and file != '.metadata.json' and file not in ['cover.jpg', 'cover.png', 'folder.jpg', 'cover.webp']:
                            try: os.unlink(os.path.join(root, file))
                            except: pass
                    for d in dirs:
                        try: os.rmdir(os.path.join(root, d))
                        except: pass
        db_session.commit()
    except:
        db_meta.zip_status = "error"
        db_session.commit()
    finally:
        if internal_session: db_session.close()

# Alias for compatibility with old tests/modules if needed
def migrate_legacy_metadata(folder_path: Path) -> bool:
    from .services.metadata_service import MetadataService
    return MetadataService.migrate_legacy(folder_path)

def sync_metadata_to_db(folder_path: Path, db_session, current_hash: Optional[str] = None, meta_obj: Optional[UnifiedMetadata] = None):
    from .services.metadata_service import MetadataService
    return MetadataService.sync_to_db(folder_path, db_session, force=(current_hash == "RO_MODE"), current_hash=current_hash, meta_obj=meta_obj)
