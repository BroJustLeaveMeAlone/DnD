# Credentials — template

Copy to `CREDENTIALS.md` and fill in real values. `CREDENTIALS.md` is gitignored; this file is
committed and must contain **placeholders only**.

This repo is public. Never put a real secret in this file.

---

## Local development database

Created by `docker compose up -d postgres`.

| Field    | Value                                                   |
| -------- | ------------------------------------------------------- |
| Host     | `localhost`                                             |
| Port     | `5432` (change if taken; update `POSTGRES_PORT` too)    |
| Database | `ttrpg`                                                 |
| User     | `ttrpg`                                                 |
| Password | `<from .env POSTGRES_PASSWORD>`                         |
| URL      | `postgresql://<user>:<password>@localhost:<port>/ttrpg` |

---

## Auth.js session secret

| Field | Value                              |
| ----- | ---------------------------------- |
| Key   | `AUTH_SECRET`                      |
| Value | `<generate with: npx auth secret>` |

---

## OAuth providers

Callback URL is `http://localhost:<port>/api/auth/callback/<provider>`.

| Provider | Key                   | Value             |
| -------- | --------------------- | ----------------- |
| Discord  | `AUTH_DISCORD_ID`     | `<client id>`     |
| Discord  | `AUTH_DISCORD_SECRET` | `<client secret>` |
| Google   | `AUTH_GOOGLE_ID`      | `<client id>`     |
| Google   | `AUTH_GOOGLE_SECRET`  | `<client secret>` |

---

## Application admin accounts

Needed for the Commons moderation queue (Phase 12).

| Field    | Value              |
| -------- | ------------------ |
| Email    | `<admin email>`    |
| Password | `<admin password>` |

---

## Third-party services

Object storage, and any optional AI provider key for the Phase 17 layer. The AI layer is
bring-your-own-key, so no shared key should be required.
