"""Pure ILRD JVM tests. This does not compile Android/Capacitor integration."""
from pathlib import Path
import hashlib
import os
import shutil
import subprocess
import tempfile
import urllib.request

dependencies={
 "json":("org/json/json/20240303/json-20240303.jar","3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed"),
 "junit":("junit/junit/4.13.2/junit-4.13.2.jar","8e495b634469d64fb8acfa3495a065cbacc8a0fff55ce1e31007be4c16dc57d3"),
 "hamcrest":("org/hamcrest/hamcrest-core/1.3/hamcrest-core-1.3.jar","66fdef91e9739348df7a096aa384a5685f4e875584cce89386a7a47251c4d8e9")}
with tempfile.TemporaryDirectory(prefix="blocky-ilrd-") as tmp:
    root=Path(tmp);jars=[]
    for name,(resource,digest) in dependencies.items():
        target=root/(name+".jar")
        configured=os.environ.get("BLOCKY_JAVA_TEST_DEPS")
        if configured: target.write_bytes((Path(configured)/(name+".jar")).read_bytes())
        else:
            with urllib.request.urlopen("https://repo.maven.apache.org/maven2/"+resource,timeout=30) as response: target.write_bytes(response.read())
        assert hashlib.sha256(target.read_bytes()).hexdigest()==digest
        jars.append(str(target))
    cp=os.pathsep.join(jars);classes=root/"classes";classes.mkdir()
    compiler=[shutil.which("javac")] if shutil.which("javac") else ["java","-m","jdk.compiler/com.sun.tools.javac.Main"]
    sources=["android/app/src/main/java/com/danilah/blocky/dev/IlrdPayload.java","android/app/src/test/java/com/danilah/blocky/dev/IlrdPayloadTest.java"]
    subprocess.run(compiler+["-source","17","-target","17","-cp",cp,"-d",str(classes),*sources],check=True)
    subprocess.run(["java","-cp",str(classes)+os.pathsep+cp,"org.junit.runner.JUnitCore","com.danilah.blocky.dev.IlrdPayloadTest"],check=True)
