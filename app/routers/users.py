from fastapi import APIRouter, HTTPException
from sqlalchemy import or_
from ..models import GameMeta, UserReview
from ..schemas import UserReviewSaveRequest
from ..utils import normalize_path
from ..dependencies import DB, CurrentUser

router = APIRouter()

@router.post("/api/user/save_review", summary="Enregistrer un avis / Save review")
def save_review(req: UserReviewSaveRequest, user: CurrentUser, db: DB):
    """
    [FR] Enregistre ou met à jour la note (0-5) et le commentaire personnel d'un utilisateur sur un jeu.
    [EN] Saves or updates a user's rating (0-5) and personal comment on a game.
    """
    if not user: raise HTTPException(status_code=401)
    
    norm_path = normalize_path(req.folder_path)
    review = db.query(UserReview).filter(UserReview.user_id == user.id, UserReview.folder_path == norm_path).first()
    
    if review:
        if req.rating is not None: review.rating = req.rating
        if req.comment is not None: review.comment = req.comment
    else:
        review = UserReview(user_id=user.id, folder_path=norm_path, rating=req.rating, comment=req.comment)
        db.add(review)
    
    db.commit()
    return {"ok": True}

@router.get("/api/user/zip-notifications", summary="Notifications d'archivage / Archive notifications")
def get_zip_notifications(user: CurrentUser, db: DB):
    """
    [FR] Récupère la liste des tâches d'archivage terminées ou en cours pour afficher des notifications à l'utilisateur.
    [EN] Retrieves the list of completed or ongoing archive tasks to display notifications to the user.
    """
    if not user: raise HTTPException(status_code=401)
    
    games = db.query(GameMeta).filter(
        or_(
            (GameMeta.zip_status == 'ready') & (GameMeta.zip_notified == False),
            (GameMeta.zip_status == 'processing')
        )
    ).all()
    
    results = []
    for game in games:
        name = game.title_fr or game.title_en or game.folder_path.split('/')[-1]
        results.append({
            "folder_path": game.folder_path, "name": name, "zip_path": game.zip_path,
            "zip_status": game.zip_status, "zip_progress": game.zip_progress
        })
        if game.zip_status == 'ready': game.zip_notified = True
    
    db.commit()
    return {"notifications": results}
