"""Reproducible preview build. Fail before build if isolation/signing is unavailable."""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

parser=argparse.ArgumentParser();parser.add_argument("--check",action="store_true");parser.add_argument("--output",type=Path);parser.add_argument("--analytics",choices=["off","test"],default="off");args=parser.parse_args()
os.environ["BLOCKY_PREVIEW_ANALYTICS"]=args.analytics
key=os.environ.get("APPMETRICA_TEST_API_KEY","");production=os.environ.get("APPMETRICA_API_KEY","")
sdk=Path(os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or Path.home()/"Android/Sdk")
keystore=Path.home()/".android/debug.keystore"
blockers=[]
if args.analytics == "test" and (not re.fullmatch(r"[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}",key) or key==production): blockers.append("Separate valid APPMETRICA_TEST_API_KEY missing")
if not (sdk/"platforms/android-36/android.jar").exists(): blockers.append("Android SDK platform 36 missing")
if not (sdk/"build-tools/36.0.0/apksigner").exists(): blockers.append("Android build-tools 36.0.0 missing")
if not keystore.exists(): blockers.append("Original preview signing key missing; required SHA256 e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13")
if not shutil.which("javac"): blockers.append("Full JDK command-line tools not configured")
result={"version":"0.64.0-preview","ads":"Yandex demo units only","analytics":"off" if args.analytics == "off" else "separate test project", "blockers":blockers}
if blockers or args.check:
    print(json.dumps(result,indent=2));raise SystemExit(2 if blockers else 0)
subprocess.run(["npm","ci"],check=True)
subprocess.run(["npm","run","android:sync"],check=True)
prepared=subprocess.check_output(["python3","scripts/prepare_gradle.py"],text=True)
gradle=prepared.strip().splitlines()[-1].removeprefix("Gradle ready: ")
subprocess.run([gradle,"--project-dir","android",":app:testDebugUnitTest",":app:assembleDebug","--no-daemon"],check=True)
subprocess.run(["python3","scripts/verify-preview-apk.py"],check=True)
apk=Path("android/app/build/outputs/apk/debug/app-debug.apk")
if args.output:
    args.output.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(apk,args.output)
print(json.dumps({**result,"apk":str(args.output or apk),"sha256":hashlib.sha256(apk.read_bytes()).hexdigest()},indent=2))
