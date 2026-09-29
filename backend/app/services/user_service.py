from pydantic import BaseModel
from typing import Optional
from app.db.supabase import get_supabase


class User(BaseModel):
    id: str
    email: str
    # None for an account created by signing in with GitHub, which has no
    # password until the user sets one.
    hashed_password: Optional[str] = None
    # Display name, collected at signup. Optional so that accounts created
    # before this field existed still load.
    name: Optional[str] = None


def _one(response) -> Optional[dict]:
    # maybe_single() returns None rather than an empty response when there
    # is no row.
    if response is None:
        return None
    data = getattr(response, "data", None)
    return data if isinstance(data, dict) else None


def normalise_email(email: str) -> str:
    """Emails are compared case-insensitively. The unique constraint in
    001 is case-sensitive, so `A@x.com` and `a@x.com` could otherwise be
    two accounts."""
    return (email or "").strip().lower()


def get_user_by_email(email: str) -> Optional[User]:
    try:
        supabase = get_supabase()
        response = (
            supabase.table("users")
            .select("*")
            .eq("email", normalise_email(email))
            .maybe_single()
            .execute()
        )
        row = _one(response)
        if row is None and email != normalise_email(email):
            # Accounts created before normalisation may be stored with
            # their original casing.
            row = _one(
                supabase.table("users").select("*").eq("email", email).maybe_single().execute()
            )
        return User(**row) if row else None
    except Exception as e:
        raise RuntimeError(f"Database error in get_user_by_email: {e}")


def get_user_by_id(user_id: str) -> Optional[User]:
    """Used by GET /auth/me to turn the JWT subject back into a user, so a
    stored token is validated against the database rather than trusted
    because it happens to sit in localStorage."""
    try:
        supabase = get_supabase()
        response = supabase.table("users").select("*").eq("id", user_id).maybe_single().execute()
        row = _one(response)
        return User(**row) if row else None
    except Exception as e:
        raise RuntimeError(f"Database error in get_user_by_id: {e}")


def create_user(
    email: str, hashed_password: Optional[str], name: Optional[str] = None
) -> User:
    try:
        supabase = get_supabase()
        response = supabase.table("users").insert({
            "email": normalise_email(email),
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


def set_password(user_id: str, hashed_password: str) -> None:
    get_supabase().table("users").update({"hashed_password": hashed_password}).eq(
        "id", user_id
    ).execute()


# --- external identities (migration 005) --------------------------------

PROVIDER_GITHUB = "github"


def get_identity(provider: str, provider_user_id: str) -> Optional[dict]:
    try:
        resp = (
            get_supabase()
            .table("user_identities")
            .select("*")
            .eq("provider", provider)
            .eq("provider_user_id", provider_user_id)
            .maybe_single()
            .execute()
        )
        return _one(resp)
    except Exception as e:
        raise RuntimeError(f"Database error in get_identity: {e}")


def identities_for_user(user_id: str) -> list[dict]:
    try:
        resp = (
            get_supabase()
            .table("user_identities")
            .select("provider, login, email, created_at")
            .eq("user_id", user_id)
            .execute()
        )
        return resp.data or [] if resp is not None else []
    except Exception:
        # Before migration 005 the table does not exist; nobody is linked.
        return []


def link_identity(
    user_id: str,
    provider: str,
    provider_user_id: str,
    login: Optional[str],
    email: Optional[str],
    email_verified: bool,
) -> None:
    get_supabase().table("user_identities").upsert(
        {
            "user_id": user_id,
            "provider": provider,
            "provider_user_id": provider_user_id,
            "login": login,
            "email": email,
            "email_verified": email_verified,
        },
        on_conflict="provider,provider_user_id",
    ).execute()


def unlink_identity(user_id: str, provider: str) -> None:
    get_supabase().table("user_identities").delete().eq("user_id", user_id).eq(
        "provider", provider
    ).execute()


def names_for(user_ids: list[str]) -> dict[str, dict]:
    """{user_id: {"email", "name"}} for display in review history."""
    ids = [u for u in set(user_ids) if u]
    if not ids:
        return {}
    try:
        resp = get_supabase().table("users").select("id, email, name").in_("id", ids).execute()
        return {r["id"]: r for r in (resp.data or [])}
    except Exception:
        return {}
