from app.main import app
import uvicorn

if __name__ == "__main__":
    # Le serveur se lance maintenant via le module app
    uvicorn.run(app, host="0.0.0.0", port=5000)
