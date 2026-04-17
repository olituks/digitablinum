from sqlalchemy import Column, Integer, String, Text, ForeignKey, Float, Boolean, DateTime, Table
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

# Association Tables for Many-to-Many
game_developers = Table(
    "game_developers",
    Base.metadata,
    Column("game_id", Integer, ForeignKey("game_meta.id"), primary_key=True),
    Column("developer_id", Integer, ForeignKey("developers.id"), primary_key=True)
)

game_studios = Table(
    "game_studios",
    Base.metadata,
    Column("game_id", Integer, ForeignKey("game_meta.id"), primary_key=True),
    Column("studio_id", Integer, ForeignKey("studios.id"), primary_key=True)
)

game_platforms = Table(
    "game_platforms",
    Base.metadata,
    Column("game_id", Integer, ForeignKey("game_meta.id"), primary_key=True),
    Column("platform_id", Integer, ForeignKey("platforms.id"), primary_key=True)
)

game_publishers = Table(
    "game_publishers",
    Base.metadata,
    Column("game_id", Integer, ForeignKey("game_meta.id"), primary_key=True),
    Column("publisher_id", Integer, ForeignKey("publishers.id"), primary_key=True)
)

game_genres = Table(
    "game_genres",
    Base.metadata,
    Column("game_id", Integer, ForeignKey("game_meta.id"), primary_key=True),
    Column("genre_id", Integer, ForeignKey("genres.id"), primary_key=True)
)

game_tags = Table(
    "game_tags",
    Base.metadata,
    Column("game_id", Integer, ForeignKey("game_meta.id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id"), primary_key=True)
)

__all__ = [
    "User", "FileNote", "PinnedFile", "GameMeta", "Developer", 
    "Studio", "Platform", "Publisher", "Genre", "Tag", "SyncLog", "UserReview", "SystemConfig", "GameFamily"
]

class SystemConfig(Base):
    __tablename__ = "system_config"
    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class UserReview(Base):
    __tablename__ = "user_reviews"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    folder_path = Column(String, index=True) # Absolute path to game folder
    rating = Column(Integer, nullable=True) # 1-5
    comment = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="reviews")

class Developer(Base):
    __tablename__ = "developers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

class Studio(Base):
    __tablename__ = "studios"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

class Platform(Base):
    __tablename__ = "platforms"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

class Publisher(Base):
    __tablename__ = "publishers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

class Genre(Base):
    __tablename__ = "genres"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    family = Column(String, index=True) # Tag family/group
    color = Column(String, default="#7a7f85") # Default gray from user request

class GameFamily(Base):
    __tablename__ = "game_families"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(Text, nullable=True)
    cover_path = Column(String, nullable=True) # Path to family cover image

class SyncLog(Base):
    __tablename__ = "sync_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    migrated_count = Column(Integer, default=0)
    synced_count = Column(Integer, default=0)
    errors = Column(Text, nullable=True)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True)
    oidc_sub = Column(String, unique=True, index=True, nullable=True)
    role = Column(String, default="viewer")
    last_seen = Column(DateTime, default=datetime.utcnow)
    must_change_password = Column(Boolean, default=False)

class FileNote(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True, index=True)
    file_hash = Column(String, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    content = Column(Text)
    updated_at = Column(String)
    owner = relationship("User")

class PinnedFile(Base):
    __tablename__ = "pinned_files"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    file_path = Column(String, index=True)
    filename = Column(String, nullable=True)
    thumbnail_base64 = Column(Text, nullable=True)

class GameMeta(Base):
    __tablename__ = "game_meta"
    id = Column(Integer, primary_key=True, index=True)
    folder_path = Column(String, unique=True, index=True)
    description = Column(Text, nullable=True)
    external_links = Column(Text, nullable=True) # JSON stored as string
    
    title_fr = Column(String, nullable=True)
    title_en = Column(String, nullable=True)
    genre = Column(String, nullable=True)
    keywords = Column(String, nullable=True)
    release_date = Column(String, nullable=True)
    universe = Column(String, nullable=True)
    
    youtube_urls = Column(Text, nullable=True)
    steam_url = Column(String, nullable=True)
    igdb_id = Column(String, nullable=True)
    rating = Column(Float, nullable=True)
    
    ai_suggestions_cache = Column(Text, nullable=True) # JSON stored as string
    editions_cache = Column(Text, nullable=True) # JSON stored as string
    sidecar_hash = Column(String, nullable=True) # MD5 of .metadata.json

    is_archived = Column(Boolean, default=False)
    archived_files_json = Column(Text, nullable=True)

    # ZIP Creation Background Task
    zip_status = Column(String, default="idle")
    zip_progress = Column(Integer, default=0)
    zip_path = Column(String, nullable=True)
    zip_notified = Column(Boolean, default=False)

    # Game Family
    family_id = Column(Integer, ForeignKey("game_families.id"), nullable=True)
    family = relationship("GameFamily", backref="games_list")

    # Normalized Relationships
    developers_list = relationship("Developer", secondary=game_developers, backref="games_developed")
    studios_list = relationship("Studio", secondary=game_studios, backref="games_produced")
    platforms_list = relationship("Platform", secondary=game_platforms, backref="games_on_platform")
    publishers_list = relationship("Publisher", secondary=game_publishers, backref="games_published")
    genres_list = relationship("Genre", secondary=game_genres, backref="games_in_genre")
    tags_list = relationship("Tag", secondary=game_tags, backref="games_tagged")
