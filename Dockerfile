# ─────────────────────────────────────────────────────────────
# Image de base pour pc-games-collection
# Toutes les dépendances système sont installées au BUILD,
# jamais au démarrage du container.
# ─────────────────────────────────────────────────────────────
FROM python:3.9-slim

# -- Dépendances système (une seule fois, au build) -----------
RUN apt-get update && apt-get install -y --no-install-recommends \
        p7zip-full \
        genisoimage \
    && rm -rf /var/lib/apt/lists/*

# -- Répertoire de travail ------------------------------------
WORKDIR /app

# -- Dépendances Python (layer caché, rebuild si requirements change) --
# On copie UNIQUEMENT requirements.txt d'abord pour profiter
# du cache Docker : si le code change mais pas les deps, ce
# layer n'est pas reconstruit.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# -- Note : le code source n'est PAS copié ici ----------------
# Il est injecté via le volume dans compose.yaml (/app),
# ce qui permet le hot-reload d'uvicorn en développement.
