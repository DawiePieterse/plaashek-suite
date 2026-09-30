# Putting Plaashek on Afrihost

Plaashek runs on the same Afrihost cPanel hosting as Bowls Buddy and Budgeteer (Bronze Pro, cPanel user
`bowlsbg5n9w0`, server `thula.aserv.co.za`), on its own domain `plaashek.co.za`. The API is PHP (Laravel,
`services/hek`) on MariaDB, and each farm has its own database (ADR 0014, ADR 0015). Everything below is done
in cPanel, plus a few commands in cPanel's **Terminal**. No passwords are kept in this file.

## What goes where

| Host | What | Folder (document root) |
|---|---|---|
| `plaashek.co.za` | Marketing page | `plaashek-site/` |
| `hek.plaashek.co.za` | Plaashek Management | `plaashek-management/` |
| `admin.plaashek.co.za` | Farm Admin Tool | `plaashek-admin/` |
| `app.plaashek.co.za` | Field app on the phones, and the pairing QR address | `plaashek-field/` |
| `eienaar.plaashek.co.za` | Owner Module | `plaashek-owner/` |
| `api.plaashek.co.za` | The API | `plaashek-hek/public` |

| Database | What |
|---|---|
| `bowlsbg5n9w0_plaashek` | Central: organisations, farms, licences, Plaashek staff, the login directory |
| `bowlsbg5n9w0_f_<farm>` | One per farm, made when the farm is created (below) |

All folders sit in the home folder, next to `public_html`, not inside it. Only an app's own folder, and the
API's `public/`, can be reached from the web.

**Database budget:** Bronze Pro has 20 databases, shared with the Bowls Buddy clubs (one each) and Budgeteer.
Plaashek takes one central and one per farm. Silver Pro (100 databases, R179 a month) is the next step up.

## What gets built

```bash
scripts/build-afrihost.sh                           # apps point at https://api.plaashek.co.za
scripts/build-afrihost.sh https://api.plaashek.co.za build/afrihost
```

It builds from the last commit into `build/afrihost/`: `plaashek-hek.zip` (the API with `vendor/`) and
`plaashek-management.zip`, `plaashek-admin.zip`, `plaashek-field.zip`, `plaashek-owner.zip`. Each app zip has an
`.htaccess` that sends every path that is not a file to `index.html`, so `/pair/<token>` loads. It needs PHP 8.2+,
Composer, Node 20+ and pnpm.

## First time

### 1. Domain and hosts

1. **Domains → Create A New Domain**: `plaashek.co.za`. Untick **Share document root**, document root
   `plaashek-site`.
2. The same for each subdomain in the table above: `hek`, `admin`, `app`, `eienaar` and `api`.plaashek.co.za,
   each with its own document root (`api` gets `plaashek-hek/public`).
3. **DNS:** registered at Afrihost, nothing to do. Registered elsewhere, set its nameservers to Afrihost's, or
   add A records for `@` and `*` pointing to `197.242.159.147`.
4. **MultiPHP Manager**: set `api.plaashek.co.za` to **PHP 8.3** (`ea-php83`). Make sure `sodium`, `intl`,
   `mbstring`, `pdo_mysql` and `zip` are on (Select PHP Version / extensions). The apps are plain files and need
   no PHP.
5. **SSL/TLS Status → Run AutoSSL**, and wait until every host shows a valid (not self-signed) certificate. Then
   switch on **Force HTTPS Redirect** for each under **Domains**. The phones' camera and offline storage need
   HTTPS.

### 2. The central database

**Database Wizard**: database `plaashek` (cPanel makes it `bowlsbg5n9w0_plaashek`), a user such as `hek` with a
generated password, **ALL PRIVILEGES**. Keep the password for step 4.

### 3. Upload

In **File Manager**, for each zip: upload it into its folder and **Extract**, then delete the zip.

- `plaashek-hek.zip` → `plaashek-hek/` (you should see `app`, `public`, `vendor`, `artisan` inside it)
- `plaashek-management.zip` → `plaashek-management/`, and so on for `admin`, `field`, `owner`

### 4. Settings (`plaashek-hek/.env`)

In File Manager, in `plaashek-hek`, copy `.env.example` to `.env` (Settings → **Show Hidden Files**), then **Edit**
it:

```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.plaashek.co.za

LOG_CHANNEL=single
LOG_LEVEL=error

DB_HOST=localhost
DB_DATABASE=bowlsbg5n9w0_plaashek
DB_USERNAME=bowlsbg5n9w0_hek
DB_PASSWORD=<the database password from step 2>

FARM_DB_PREFIX=bowlsbg5n9w0_
FARM_DB_AUTO_CREATE=false

CORS_ORIGINS=https://hek.plaashek.co.za,https://admin.plaashek.co.za,https://app.plaashek.co.za,https://eienaar.plaashek.co.za
FIELD_APP_URL=https://app.plaashek.co.za

CACHE_STORE=file
```

Leave `APP_KEY`, `TICKET_SIGNING_KEY_JWK`, `STAFF_SESSION_SECRET` and `MANAGEMENT_SESSION_SECRET` empty; the next
step fills them in. Never put this file in GitHub.

### 5. Finish in Terminal

```sh
cd ~/plaashek-hek
PHP=/opt/cpanel/ea-php83/root/usr/bin/php
$PHP artisan key:generate --force
$PHP artisan plaashek:keys
$PHP artisan migrate --force
$PHP artisan plaashek:staff-create --email=<your email>
$PHP artisan config:cache && $PHP artisan route:cache
chmod -R u+rwX storage bootstrap/cache
```

`plaashek:staff-create` asks for a password: that is the Plaashek Management login.

**Keep a copy of `.env` somewhere safe.** `APP_KEY` encrypts each farm's database password, and the ticket key
signs every paired phone. Losing them means re-entering farm database passwords and re-pairing every phone.

### 6. Nightly backup (cron)

**Cron Jobs → Add New Cron Job**, once a day (`15 2 * * *`):

```
cd ~/plaashek-hek && /opt/cpanel/ea-php83/root/usr/bin/php artisan plaashek:backup >> /dev/null 2>&1
```

It writes one dump per database to `~/plaashek-hek/storage/backups/` and keeps 30 days. Download a copy off the
server regularly; Afrires (support-only restore, 14 days) is the second line.

### 7. Check

1. Open `https://api.plaashek.co.za/.well-known/jwks.json`: one key, no `d` in it.
2. Open `https://hek.plaashek.co.za` and sign in with the Management login from step 5.

## A new farm

1. **Database Wizard**: database `f_<farm>` (becomes `bowlsbg5n9w0_f_<farm>`), user `f_<farm>` with a generated
   password, **ALL PRIVILEGES** on that database only. One user per farm keeps each farm's connection inside its
   own farm.
2. In **Plaashek Management → Nuwe plaas**: organisation, farm name, language, and the database, user and
   password from step 1 (with the `bowlsbg5n9w0_` prefix). The API checks it can reach the database, sets it up,
   and only then adds the farm. If it cannot reach it, nothing is added: check the names and password.
3. Switch on the farm's modules, and create its first office login under **Kantoor-aanmelding**.

The command-line twin is `php artisan plaashek:farm-create --organisation=... --farm=... --db-name=... --db-user=...`.

## Updating to a new version

1. Build the zips. Upload and extract `plaashek-hek.zip` into `~/plaashek-hek`, overwriting files (`.env`, logs
   and backups are kept: the zip has no `.env` and only empty `storage` folders), and each app zip into its
   folder.
2. In Terminal:

```sh
cd ~/plaashek-hek
PHP=/opt/cpanel/ea-php83/root/usr/bin/php
$PHP artisan migrate --force
$PHP artisan plaashek:farms-migrate
$PHP artisan config:cache && $PHP artisan route:cache
```

`plaashek:farms-migrate` names every farm database and says whether it is up to date; a farm whose migration fails
is reported and the others still run.

## Demo farm

`php artisan plaashek:seed --db-name=bowlsbg5n9w0_f_mooiplaas --db-user=bowlsbg5n9w0_f_mooiplaas` (after making
that database in the Wizard) creates Mooiplaas with `admin@mooiplaas.test` / `mooi1234`; re-running it resets only
Mooiplaas. Leave it off a production install unless you want a demo farm there.

## If something goes wrong

- **Error page or `internal_error`:** `~/plaashek-hek/storage/logs/laravel.log`.
- **"500" straight after upload:** `storage` or `bootstrap/cache` not writable (step 5, last line), or `APP_KEY`
  missing.
- **An app loads but says it cannot reach the server:** the zips were built for another API address
  (`scripts/build-afrihost.sh <api-url>`), or `CORS_ORIGINS` does not list that app's host exactly (with
  `https://`). Run `config:cache` after changing `.env`.
- **A QR slip opens a blank page or 404 on the phone:** the field app's `.htaccess` is missing from
  `plaashek-field/` (File Manager hides dot files unless Show Hidden Files is on).
- **"farm_database_unreachable" when creating a farm:** the database or user name is missing the
  `bowlsbg5n9w0_` prefix, the user was not added to the database, or the password is wrong.
- **A farm's database was moved or its password changed:** update that farm's row in the central database
  (the password is encrypted: set it with `php artisan tinker`,
  `DB::table('farms')->where('slug', '...')->update(['db_password' => Crypt::encryptString('...')])`).

## Shared account

Plaashek, the Bowls Buddy clubs and Budgeteer run as the same cPanel user, so a flaw in any one could read the
others' files, including each `.env`. Keeping all three patched protects all three. Farm workers' personal data
is in Plaashek (POPIA): a separate Afrihost account for Plaashek removes that link, at the price of a second
package.
