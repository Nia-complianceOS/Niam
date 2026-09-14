from pydantic import BaseModel
from typing import Optional
from app.db.supabase import get_supabase


class User(BaseModel):
    id: str
    email: str
    hashed_password: str
    # Display name, collected at signup. Optional so that accounts created
    # before this field existed still load.
    name: Optional[str] = None


def get_user_by_email(email: str) -> Optional[User]:
    try:
        supabase = get_supabase()
        response = supabase.table("users").select("*").eq("email", email).maybe_single().execute()
        if response and isinstance(response.data, dict):
            return User(**response.data)
        return None
    except Exception as e:
        raise RuntimeError(f"Database error in get_user_by_email: {e}")


def get_user_by_id(user_id: str) -> Optional[User]:
    """Used by GET /auth/me to turn the JWT subject back into a user, so a
    stored token is validated against the database rather than trusted
    because it happens to sit in localStorage."""
    try:
        supabase = get_supabase()
        response = supabase.table("users").select("*").eq("id", user_id).maybe_single().execute()
        if response and isinstance(response.data, dict):
            return User(**response.data)
        return None
    except Exception as e:
        raise RuntimeError(f"Database error in get_user_by_id: {e}")


def create_user(
    email: str, hashed_password: str, name: Optional[str] = None
) -> User:
    try:
        supabase = get_supabase()
        response = supabase.table("users").insert({
            "email": email,
            "hashed_password": hashed_password,
            "name": name
        }).execute()
        if isinstance(response.data, list) and len(response.data) > 0:
            row = response.data[0]
            if isinstance(row, dict):
                return User(**row)
        raise RuntimeError("No data returned from insert")
    except Exception as e:
        raise RuntimeError(f"Database error in create_user: {e}")
