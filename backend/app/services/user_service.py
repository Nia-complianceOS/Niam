import uuid
from pydantic import BaseModel
from typing import Optional
from app.db.database import run_query


class User(BaseModel):
    id: str
    email: str
    hashed_password: str


def get_user_by_email(email: str) -> Optional[User]:
    query = "MATCH (u:User {email: $email}) RETURN u.id AS id, u.email AS email, u.hashed_password AS hashed_password"
    records = run_query(query, {"email": email})
    if records:
        return User(**records[0])
    return None


def create_user(email: str, hashed_password: str) -> User:
    query = """
    CREATE (u:User {
        id: $id,
        email: $email,
        hashed_password: $hashed_password
    })
    RETURN u.id AS id, u.email AS email, u.hashed_password AS hashed_password
    """
    user_id = uuid.uuid4().hex
    records = run_query(
        query,
        {"id": user_id, "email": email, "hashed_password": hashed_password},
    )
    return User(**records[0])
