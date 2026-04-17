import json
import os
import logging
from pathlib import Path
from typing import Dict, Any

logger = logging.getLogger(__name__)

class I18nService:
    def __init__(self, locales_dir: str = "static/locales", default_lang: str = "fr"):
        self.locales_dir = Path(locales_dir)
        self.default_lang = default_lang
        self.translations: Dict[str, Dict[str, str]] = {}
        self._load_translations()

    def _load_translations(self):
        if not self.locales_dir.exists():
            logger.warning(f"Locales directory {self.locales_dir} does not exist.")
            return

        for json_file in self.locales_dir.glob("*.json"):
            lang = json_file.stem
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    self.translations[lang] = json.load(f)
                logger.info(f"Loaded translations for language: {lang}")
            except Exception as e:
                logger.error(f"Error loading translation file {json_file}: {e}")

    def reload(self):
        """Reload all translation files from disk."""
        logger.info("Reloading translations from disk...")
        self.translations = {}
        self._load_translations()
        return True

    def get_text(self, key: str, lang: str = None, **kwargs) -> str:
        if not lang:
            lang = self.default_lang
        
        # Try requested language
        text = key
        lang_translations = self.translations.get(lang)
        if lang_translations and key in lang_translations:
            text = lang_translations[key]
        elif lang != self.default_lang:
            # Fallback to default language
            default_translations = self.translations.get(self.default_lang)
            if default_translations and key in default_translations:
                text = default_translations[key]
        
        # Interpolate variables if any
        if kwargs:
            try:
                return text.format(**kwargs)
            except Exception as e:
                logger.error(f"Error interpolating i18n key '{key}': {e}")
        
        return text

    def get_all_translations(self, lang: str = None) -> Dict[str, str]:
        if not lang:
            lang = self.default_lang
        
        # We return the merged dictionary: default + requested
        base = self.translations.get(self.default_lang, {}).copy()
        if lang != self.default_lang:
            base.update(self.translations.get(lang, {}))
        return base

i18n_service = I18nService()
