"""Run the production-length Android diagnostic in an isolated software-rendered emulator."""
import subprocess
import sys
import threading
from pathlib import Path


def adb(*args, timeout=30, check=True, stdout=None):
    return subprocess.run(['adb', *args], timeout=timeout, check=check, stdout=stdout)


# Preserve CSS viewport size while avoiding a 1080x2400 software-GPU benchmark.
# This tests Android transport and outputs; emulator RAF never proves POCO performance.
adb('shell', 'svc', 'wifi', 'disable')
adb('shell', 'svc', 'data', 'disable')
adb('shell', 'pm', 'disable-user', '--user', '0', 'com.google.android.apps.messaging', check=False)
adb('shell', 'wm', 'size', '540x1200')
adb('shell', 'wm', 'density', '210')
for scale in ['animator_duration_scale', 'window_animation_scale', 'transition_animation_scale']:
    adb('shell', 'settings', 'put', 'global', scale, '1.0')
adb('install', '-r', 'diagnostic-app/app-debug.apk')
adb('install', '-r', '-t', 'diagnostic-test/app-debug-androidTest.apk')
log = Path('cdp-emulator-logcat.txt').open('wb')
logger = subprocess.Popen(['adb', 'logcat', '-v', 'threadtime', 'Capacitor:V', 'Capacitor/Console:V',
                           'chromium:I', 'System.out:I', 'AndroidRuntime:E', '*:S'], stdout=log)
status = 1
try:
    with Path('cdp-emulator-result.txt').open('wb') as result:
        process = subprocess.Popen(['adb', 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
                                    'com.danilah.blocky.dev.CdpDeviceSmoke',
                                    'com.danilah.blocky.dev.test/androidx.test.runner.AndroidJUnitRunner'],
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        watchdog = threading.Timer(18 * 60, process.kill)
        watchdog.start()
        try:
            for line in process.stdout:
                sys.stdout.buffer.write(line)
                sys.stdout.buffer.flush()
                result.write(line)
                result.flush()
            status = process.wait(timeout=20)
        finally:
            watchdog.cancel()
            if process.poll() is None:
                process.kill()
finally:
    logger.terminate()
    try:
        logger.wait(timeout=5)
    except subprocess.TimeoutExpired:
        logger.kill()
    log.close()
    for remote, local in [('cache/blocky-full-diagnostic.zip', 'cdp-emulator-full.zip'),
                          ('cache/cdp-smoke-report.json', 'cdp-smoke-report.json')]:
        try:
            with Path(local).open('wb') as output:
                adb('exec-out', 'run-as', 'com.danilah.blocky.dev', 'cat', remote, stdout=output)
        except (subprocess.SubprocessError, OSError) as error:
            print('Artifact extraction failed:', local, type(error).__name__, flush=True)
    result_text = Path('cdp-emulator-result.txt').read_text(errors='replace')
    passed = status == 0 and 'OK (1 test)' in result_text and 'FAILURES!!!' not in result_text
    if not passed:
        try:
            with Path('cdp-emulator-cache.tar').open('wb') as output:
                adb('exec-out', 'run-as', 'com.danilah.blocky.dev', 'tar', '-cf', '-',
                    'cache/blocky-full-diagnostic', stdout=output, timeout=45)
        except (subprocess.SubprocessError, OSError):
            pass
if not passed:
    raise SystemExit('Android full diagnostic failed; see progress, logcat and checkpoint artifacts')
subprocess.run([sys.executable, 'scripts/analyze-full-clear.py', 'cdp-emulator-full.zip',
                'cdp-emulator-analysis.json'], check=True)
