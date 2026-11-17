#!/usr/bin/env python3
"""Create a private, verified PostgreSQL archive from a saved Railway variables JSON."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import unquote, urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--variables', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    variables = json.loads(args.variables.read_text())
    connection = urlparse(variables['DATABASE_PUBLIC_URL'])
    if connection.scheme not in ('postgres', 'postgresql') or not connection.hostname:
        parser.error('DATABASE_PUBLIC_URL must be a public PostgreSQL connection URL')
    env = {
        **os.environ,
        'PGHOST': connection.hostname,
        'PGPORT': str(connection.port or 5432),
        'PGUSER': unquote(connection.username or ''),
        'PGPASSWORD': unquote(connection.password or ''),
        'PGDATABASE': unquote(connection.path.lstrip('/')),
        'PGCONNECT_TIMEOUT': '15',
        'PGSSLMODE': 'prefer',
    }

    def tool(name):
        path = shutil.which(name) or str(Path('/opt/homebrew/opt/libpq/bin') / name)
        if not Path(path).is_file():
            parser.error(f'{name} is missing; install PostgreSQL client tools first')
        return path

    def run(name, *options):
        result = subprocess.run([tool(name), *options], env=env, capture_output=True, text=True)
        if result.returncode:
            # Connection errors may contain private host or role details. Keep them local.
            (args.output / 'backup-error.txt').write_text(result.stderr)
            raise RuntimeError(f'{name} failed; see the private backup-error.txt. No complete backup created.')
        return result.stdout

    args.output.mkdir(parents=True, exist_ok=False, mode=0o700)
    version = run('psql', '-X', '-At', '-c', 'SHOW server_version;').strip()
    partial = args.output / 'production.dump.partial'
    run('pg_dump', '--format=custom', '--no-owner', '--no-acl', '--file', str(partial))
    contents = run('pg_restore', '--list', str(partial))
    if 'TABLE DATA' not in contents:
        raise RuntimeError('Archive contains no table data entries; inspect before using it')
    (args.output / 'archive-contents.txt').write_text(contents)
    archive = args.output / 'production.dump'
    partial.rename(archive)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    manifest = {
        'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'sourceHost': connection.hostname,
        'serverVersion': version,
        'archive': archive.name,
        'bytes': archive.stat().st_size,
        'sha256': digest,
        'archiveListVerified': True,
        'restoreVerified': False,
    }
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Archive saved: {archive}')
    print(f'SHA256: {digest}')
    print('Restore and row verification are still required before switching production.')


if __name__ == '__main__':
    main()
