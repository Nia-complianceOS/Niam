import uuid
from pydantic import BaseModel
from typing import Optional
from app.db.database import run_query


class User(BaseModel):
    id: str
    email: str
    hashed_password: str
    # Display name, collected at signup. Optional so that accounts created
    # before this field existed still load.
    name: Optional[str] = None


_RETURN_USER = (
    "RETURN u.id AS id, u.email AS email, "
    "u.hashed_password AS hashed_password, u.name AS name"
)


def get_user_by_email(email: str) -> Optional[User]:
    query = f"MATCH (u:User {{email: $email}}) {_RETURN_USER}"
    records = run_query(query, {"email": email})
    if records:
        return User(**records[0])
    return None


def get_user_by_id(user_id: str) -> Optional[User]:
    """Used by GET /auth/me to turn the JWT subject back into a user, so a
    stored token is validated against the database rather than trusted
    because it happens to sit in localStorage."""
    query = f"MATCH (u:User {{id: $user_id}}) {_RETURN_USER}"
    records = run_query(query, {"user_id": user_id})
    if records:
        return User(**records[0])
    return None


def create_user(
    email: str, hashed_password: str, name: Optional[str] = None
) -> User:
    query = f"""
    CREATE (u:User {{
        id: $id,
        email: $email,
        hashed_password: $hashed_password,
        name: $name
    }})
    {_RETURN_USER}
    """
    user_id = uuid.uuid4().hex
    records = run_query(
        query,
        {
            "id": user_id,
            "email": email,
            "hashed_password": hashed_password,
            "name": name,
        },
    )
    return User(**records[0])
