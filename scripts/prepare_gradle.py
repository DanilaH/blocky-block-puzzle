#!/usr/bin/env python3
"""Prepare the exact wrapper-pinned Gradle ZIP before Android CI compilation."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import shutil
import urllib.error
import urllib.request
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--cache-dir', type=Path, default=Path.home() / '.gradle/blocky-distributions')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
properties = dict(
    line.split('=', 1) for line in (root / 'android/gradle/wrapper/gradle-wrapper.properties').read_text().splitlines()
    if line and not line.startswith('#') and '=' in line
)
expected = properties['distributionSha256Sum']
assert re.fullmatch(r'[a-f0-9]{64}', expected), 'A pinned distribution SHA-256 is required'
url = properties['distributionUrl'].replace('\\:', ':')
version = re.search(r'gradle-([\d.]+)-bin\.zip', url).group(1)
cache = args.cache_dir.resolve() / expected
cache.mkdir(parents=True, exist_ok=True)
archive = cache / f'gradle-{version}-bin.zip'

def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()

if not archive.exists() or digest(archive) != expected:
    partial = archive.with_suffix('.partial')
    # All routes refer to the same official release. The checksum is mandatory.
    routes = [(url, {})]
    if version == '8.14.3':
        routes.append(('https://api.github.com/repos/gradle/gradle-distributions/releases/assets/269969095', {'Accept': 'application/octet-stream'}))
    routes.append((f'https://downloads.gradle.org/distributions/gradle-{version}-bin.zip', {}))
    for attempt, (route, headers) in enumerate(routes, 1):
        try:
            request = urllib.request.Request(route, headers=headers)
            with urllib.request.urlopen(request, timeout=45) as response, partial.open('wb') as output:
                shutil.copyfileobj(response, output, length=1024 * 1024)
            if digest(partial) != expected:
                raise ValueError('Downloaded distribution SHA-256 mismatch')
            partial.replace(archive)
            print(f'Gradle {version}: official download verified (route {attempt})', flush=True)
            break
        except (OSError, ValueError) as error:
            partial.unlink(missing_ok=True)
            print(f'Gradle route {attempt} failed: {type(error).__name__}, HTTP {getattr(error, "code", "n/a")}', flush=True)
    else:
        raise SystemExit('Could not obtain the checksum-pinned official Gradle distribution')
else:
    print(f'Gradle {version}: cached ZIP SHA-256 verified', flush=True)

# Re-extract from the verified archive rather than trusting cached executables.
unpacked = cache / 'unpacked'
if unpacked.exists():
    shutil.rmtree(unpacked)
with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None, 'Gradle ZIP integrity failure'
    for name in package.namelist():
        assert not Path(name).is_absolute() and '..' not in Path(name).parts, 'Unsafe archive path'
    package.extractall(unpacked)
binary = unpacked / f'gradle-{version}/bin/gradle'
binary.chmod(0o755)
if os.environ.get('GITHUB_OUTPUT'):
    with Path(os.environ['GITHUB_OUTPUT']).open('a') as output:
        output.write(f'gradle-bin={binary}\n')
print(f'Gradle ready: {binary}', flush=True)
