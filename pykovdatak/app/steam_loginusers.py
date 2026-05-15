from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple, List


def _strip_vdf_comments(s: str) -> str:
    out: List[str] = []
    i = 0
    n = len(s)
    while i < n:
        if s[i] == "/" and i + 1 < n and s[i + 1] == "/":
            i += 2
            while i < n and s[i] != "\n":
                i += 1
            continue
        out.append(s[i])
        i += 1
    return "".join(out)


@dataclass
class _Tok:
    kind: str  # "str" | "brace"
    val: str


def _tokenize_vdf(s: str) -> List[_Tok]:
    cleaned = _strip_vdf_comments(s)
    toks: List[_Tok] = []
    i = 0
    while i < len(cleaned):
        c = cleaned[i]
        if c in " \t\r\n":
            i += 1
            continue
        if c == '"':
            j = i + 1
            buf: List[str] = []
            while j < len(cleaned):
                ch = cleaned[j]
                if ch == "\\" and j + 1 < len(cleaned) and cleaned[j + 1] == '"':
                    buf.append('"')
                    j += 2
                    continue
                if ch == '"':
                    break
                buf.append(ch)
                j += 1
            toks.append(_Tok("str", "".join(buf)))
            if j < len(cleaned) and cleaned[j] == '"':
                j += 1
            i = j
            continue
        if c == "{" or c == "}":
            toks.append(_Tok("brace", c))
            i += 1
            continue
        # bare token
        j = i
        while j < len(cleaned) and cleaned[j] not in " \t\r\n{}":
            j += 1
        if j > i:
            toks.append(_Tok("str", cleaned[i:j]))
        i = j
    return toks


def _clean_token(s: str) -> str:
    return (s or "").strip().strip('"')


def parse_most_recent_user(loginusers_path: str) -> Tuple[str, str]:
    """
    Port of internal/steam/steam.go parseMostRecentUser.
    Returns (steam_id64, persona_name). Raises on failure.
    """
    p = Path(loginusers_path)
    data = p.read_text(encoding="utf-8", errors="replace")
    tokens = _tokenize_vdf(data)
    idx = 0

    def next_tok() -> Optional[_Tok]:
        nonlocal idx
        if idx >= len(tokens):
            return None
        t = tokens[idx]
        idx += 1
        return t

    # find "users"
    while True:
        t = next_tok()
        if t is None:
            raise ValueError("'users' section not found")
        if t.kind == "str" and _clean_token(t.val).lower() == "users":
            break

    t = next_tok()
    if t is None or t.kind != "brace" or t.val != "{":
        raise ValueError("missing '{' after users")

    # iterate entries
    while True:
        key = next_tok()
        if key is None:
            break
        if key.kind == "brace" and key.val == "}":
            break
        if key.kind != "str":
            continue
        steam_id = _clean_token(key.val)
        t = next_tok()
        if t is None or t.kind != "brace" or t.val != "{":
            continue
        found_mr = False
        mr_val = "0"
        persona = ""
        depth = 1
        while depth > 0:
            t2 = next_tok()
            if t2 is None:
                break
            if t2.kind == "brace":
                if t2.val == "{":
                    depth += 1
                elif t2.val == "}":
                    depth -= 1
                continue
            kname = _clean_token(t2.val)
            vtok = next_tok()
            if vtok is None:
                break
            if vtok.kind == "brace":
                if vtok.val == "{":
                    depth += 1
                elif vtok.val == "}":
                    depth -= 1
                continue
            v = _clean_token(vtok.val)
            if kname.lower() == "mostrecent":
                found_mr = True
                mr_val = v
            if kname.lower() == "personaname":
                persona = v
        if found_mr and (mr_val == "1" or mr_val.lower() == "true"):
            return steam_id, persona

    raise ValueError("no user with MostRecent = 1 found")

