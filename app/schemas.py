from pydantic import BaseModel, ConfigDict
from typing import Optional, List

class DeveloperSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str

class StudioSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str

class PlatformSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str

class GenreSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str

class PublisherSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str

class GameFamilySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    cover_path: Optional[str] = None

class TagSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    name: str
    family: str
    color: str = "#7a7f85"

class GameMetaSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    folder_path: str
    description: Optional[str] = None
    title_fr: Optional[str] = None
    title_en: Optional[str] = None
    genre: Optional[str] = None
    keywords: Optional[str] = None
    release_date: Optional[str] = None
    universe: Optional[str] = None
    youtube_urls: Optional[str] = None
    steam_url: Optional[str] = None
    igdb_id: Optional[str] = None
    rating: Optional[float] = None
    tags: Optional[List[TagSchema]] = None
    family: Optional[GameFamilySchema] = None

class SaveDescRequest(BaseModel):
    folder_path: str
    text: str

class SaveCoverRequest(BaseModel):
    folder_path: str
    image_url: Optional[str] = None

class NoteRequest(BaseModel):
    file_path: str
    text: str

class PinRequest(BaseModel):
    file_path: str

class UserCreateRequest(BaseModel):
    username: str
    password: str
    role: str
    must_change: bool

class UserEditRequest(BaseModel):
    user_id: int
    password: Optional[str] = None
    role: Optional[str] = None

class UserDeleteRequest(BaseModel):
    user_id: int

class FamilyCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None

class FamilyEditRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class SummaryRequest(BaseModel):
    file_path: str

class SuggestionRequest(BaseModel):
    folder_path: str
    game_title: str
    title_fr: Optional[str] = None
    title_en: Optional[str] = None
    publisher_orig: Optional[str] = None
    publish_date: Optional[str] = None
    rules_system: Optional[str] = None
    setting: Optional[str] = None

class FilePathRequest(BaseModel):
    file_path: str

class FolderPathRequest(BaseModel):
    folder_path: str

class RenameRequest(BaseModel):
    file_path: str
    new_name: str

class RenameFolderRequest(BaseModel):
    old_folder_path: str
    new_name: str

class UserReviewSaveRequest(BaseModel):
    folder_path: str
    rating: Optional[int] = None # 1-5
    comment: Optional[str] = None

class ZipRequest(BaseModel):
    folder_path: str

class ArchiveRequest(BaseModel):
    folder_path: str

class InvestigateRequest(BaseModel):
    archive_path: str

class GameMetaSaveRequest(BaseModel):
    folder_path: str
    title_fr: Optional[str] = None
    title_en: Optional[str] = None
    genre: Optional[str] = None
    keywords: Optional[str] = None
    release_date: Optional[str] = None
    universe: Optional[str] = None
    youtube_urls: Optional[str] = None
    steam_url: Optional[str] = None
    igdb_id: Optional[str] = None
    rating: Optional[float] = None
    is_archived: bool = False
    synopsis: Optional[str] = None
    # M2M fields as comma-separated strings
    developer: Optional[str] = None
    studio: Optional[str] = None
    platform: Optional[str] = None
    publisher: Optional[str] = None
    tags: Optional[List[TagSchema]] = None
    family_id: Optional[int] = None
    family_name: Optional[str] = None

class GameLinksRequest(BaseModel):
    folder_path: str
    links: List[dict] # Each dict: {"name": str, "url": str}

class GameEditionsCacheRequest(BaseModel):
    folder_path: str
    editions: List[dict]

class UnifiedMetadata(BaseModel):
    version: str = "1.0"
    synopsis: Optional[str] = None
    ai_suggestions_cache: Optional[dict] = None
    editions_cache: Optional[List[dict]] = None
    last_updated: Optional[str] = None
    
    # Core Metadata mirrored from GameMeta
    title_fr: Optional[str] = None
    title_en: Optional[str] = None
    genre: Optional[str] = None
    keywords: Optional[str] = None
    release_date: Optional[str] = None
    universe: Optional[str] = None
    youtube_urls: Optional[str] = None
    steam_url: Optional[str] = None
    igdb_id: Optional[str] = None
    rating: Optional[float] = None
    is_archived: bool = False
    external_links: Optional[List[dict]] = None
    
    # M2M fields as comma-separated strings for sidecar
    developer: Optional[str] = None
    studio: Optional[str] = None
    platform: Optional[str] = None
    publisher: Optional[str] = None
    tags: Optional[List[TagSchema]] = None
    family: Optional[str] = None
