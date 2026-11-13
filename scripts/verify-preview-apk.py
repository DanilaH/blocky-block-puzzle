"""Verify the exact distributable APK using Android apksigner and every dist byte."""
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import zipfile

CERT = "e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13"

def manifest(data):
    u16=lambda p:struct.unpack_from('<H',data,p)[0]
    u32=lambda p:struct.unpack_from('<I',data,p)[0]
    strings=[];result={};p=u16(2)
    while p<len(data):
        kind,header,size=struct.unpack_from('<HHI',data,p)
        assert size>=header and p+size<=len(data)
        if kind==1:
            count,styles,flags,start,_=struct.unpack_from('<IIIII',data,p+8)
            offsets=[u32(p+header+i*4) for i in range(count)]
            def n8(at):
                a=data[at]
                return (((a&127)<<8)|data[at+1],at+2) if a&128 else (a,at+1)
            def n16(at):
                a=u16(at)
                return (((a&32767)<<16)|u16(at+2),at+4) if a&32768 else (a,at+2)
            for off in offsets:
                at=p+start+off
                if flags&256:
                    _,at=n8(at);n,at=n8(at)
                    strings.append(data[at:at+n].decode('utf-8'))
                else:
                    n,at=n16(at)
                    strings.append(data[at:at+n*2].decode('utf-16le'))
        elif kind==0x102:
            name=strings[u32(p+20)]
            begin,stride,count=u16(p+24),u16(p+26),u16(p+28)
            attrs={}
            for i in range(count):
                at=p+16+begin+i*stride
                key,raw,typ,value=strings[u32(at+4)],u32(at+8),data[at+15],u32(at+16)
                attrs[key]=strings[raw] if raw!=0xffffffff else strings[value] if typ==3 else value
            if name in ('manifest','uses-sdk'):result[name]=attrs
        p+=size
    return result

apk=Path('android/app/build/outputs/apk/debug/app-debug.apk')
sdk=Path(os.environ.get('ANDROID_SDK_ROOT') or os.environ['ANDROID_HOME'])
signer=sdk/'build-tools/36.0.0/apksigner'
verified=subprocess.check_output([str(signer),'verify','--verbose','--print-certs',str(apk)],text=True)
assert re.search(r'Verified using v2 scheme.*:\s*true',verified),verified
cert=re.search(r'Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]+)',verified).group(1).lower()
assert cert==CERT,cert
z=zipfile.ZipFile(apk)
info=manifest(z.read('AndroidManifest.xml'))
gradle=Path('android/app/build.gradle').read_text()
assert info['manifest']['package']=='com.danilah.blocky.dev'
assert info['manifest']['versionCode']==int(re.search(r'versionCode\s+(\d+)',gradle).group(1))
assert info['manifest']['versionName']==re.search(r'versionName\s+"([^"]+)"',gradle).group(1)
assert info['manifest']['versionName']==re.search(r'APP_VERSION\s*=\s*"([^"]+)"',Path('src/app-version.ts').read_text()).group(1)
expected={p.relative_to('dist').as_posix():p for p in Path('dist').rglob('*') if p.is_file()}
files=[]
for name,p in sorted(expected.items()):
    data=p.read_bytes()
    assert z.read('assets/public/'+name)==data,name
    files.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
actual={n.removeprefix('assets/public/') for n in z.namelist() if n.startswith('assets/public/') and not n.endswith('/')}
assert actual-set(expected)=={'cordova.js','cordova_plugins.js'},sorted(actual-set(expected))
proof={'sourceCommit':os.environ.get('VITE_SOURCE_COMMIT'),'sourceTree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),'appVersion':info['manifest']['versionName'],'package':info['manifest']['package'],'versionCode':info['manifest']['versionCode'],'bytes':apk.stat().st_size,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'v2Verified':True,'certificateSha256':cert,'compatibleWith061':True,'productionFilesMatched':len(files),'productionFiles':files}
Path('artifacts').mkdir(exist_ok=True)
Path('artifacts/apk-verification.json').write_text(json.dumps(proof,indent=2)+'\n')
print('BLOCKY_APK_PROOF '+json.dumps({k:v for k,v in proof.items() if k!='productionFiles'}))
