"""Align real browser recordings by an injected 8px marker, then compose review video."""
from pathlib import Path
import json, subprocess, sys

root = Path(sys.argv[1])
manifest = json.loads((root / 'clips.json').read_text())
font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

def run(args):
    return subprocess.check_output(args, stderr=subprocess.DEVNULL)

def start_time(video):
    pixels = run(['ffmpeg','-v','error','-i',str(video),'-vf','format=rgb24,crop=1:1:4:4','-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])
    times = run(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','csv=p=0',str(video)]).decode().splitlines()
    for i in range(len(pixels)//3):
        red, green, blue = pixels[i*3:i*3+3]
        if green > 150 and red < 90 and blue < 90:
            return float(times[i].split(',')[0])
    raise RuntimeError(f'No commit marker in {video.name}')

for clip in manifest['clips']:
    clip['startPts'] = start_time(root / clip['filename'])
segments = []
for width in [392,872]:
    for variant in [0,1,2]:
        pair = [next(c for c in manifest['clips'] if c['viewport']['width']==width and c['variant']==variant and c['mode']==mode) for mode in ['legacy','staged']]
        crop = f"crop={width-8}:{pair[0]['viewport']['height']}:8:0"
        duration = 8
        if pair[1]['completedAtMs'] > 7500:
            duration = 9
        title = root / 'title.txt'
        title.write_text(f'Постановка {variant+1} · '+('портрет' if width==392 else 'альбом'))
        title_filter = f"drawtext=fontfile={font}:textfile={title}:fontcolor=white:fontsize=24:x=(w-text_w)/2:y=20"
        if width==392:
            graph = f'[0:v]trim=duration={duration},setpts=PTS-STARTPTS,{crop},scale=420:934,pad=444:934:0:0:color=0x091c2d[a];[1:v]trim=duration={duration},setpts=PTS-STARTPTS,{crop},scale=420:934[b];[a][b]hstack,pad=960:1080:48:100:color=0x091c2d,{title_filter},drawtext=fontfile={font}:text=0.57:fontcolor=white:fontsize=22:x=220:y=68,drawtext=fontfile={font}:text=Две фазы:fontcolor=white:fontsize=22:x=620:y=68'
        else:
            graph = f'[0:v]trim=duration={duration},setpts=PTS-STARTPTS,{crop},scale=900:404,pad=960:504:30:100:color=0x091c2d[a];[1:v]trim=duration={duration},setpts=PTS-STARTPTS,{crop},scale=900:404,pad=960:504:30:100:color=0x091c2d[b];[a][b]vstack,pad=960:1080:0:0:color=0x091c2d,{title_filter},drawtext=fontfile={font}:text=0.57:fontcolor=white:fontsize=22:x=30:y=65,drawtext=fontfile={font}:text=Две фазы:fontcolor=white:fontsize=22:x=30:y=570'
        graph += f',drawtext=fontfile={font}:text=Запись в браузере · без звука:fontcolor=0xb4c3ce:fontsize=17:x=(w-text_w)/2:y=1050,setsar=1,format=yuv420p[out]'
        segment = root / f'pair-{width}-{variant}.mp4'
        temporary = root / f'building-{width}-{variant}.mp4'
        args=['ffmpeg','-y','-v','error','-xerror']
        for clip in pair: args += ['-ss',str(clip['startPts']),'-i',str(root/clip['filename'])]
        args += ['-filter_complex',graph,'-map','[out]','-an','-r','25','-c:v','libx264','-preset','fast','-crf','20','-movflags','+faststart',str(temporary)]
        subprocess.run(args,check=True)
        info=json.loads(run(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(temporary)]))
        assert abs(float(info['format']['duration'])-duration)<0.1
        temporary.replace(segment)
        segments.append(segment)
(root/'concat.txt').write_text(''.join(f"file '{p}'\n" for p in segments))
output=root/'blocky-two-phase-comparison.mp4'
subprocess.run(['ffmpeg','-y','-v','error','-xerror','-f','concat','-safe','0','-i',str(root/'concat.txt'),'-c','copy','-movflags','+faststart',str(output)],check=True)
info=json.loads(run(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(output)]))
assert abs(float(info['format']['duration'])-sum(9 if c['mode']=='staged' and c['completedAtMs']>7500 else 8 for c in manifest['clips'] if c['mode']=='staged'))<0.1
subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(output),'-f','null','-'],check=True)
(root/'clips-aligned.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'output':str(output),'bytes':output.stat().st_size,'segments':len(segments)}))
