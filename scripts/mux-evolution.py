"""Resample actual CDP timestamps to 30 fps; keep live Web Audio from each clip."""
import bisect,json,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1]).resolve(); output=pathlib.Path(sys.argv[2]).resolve()
media=root/'mux';media.mkdir(exist_ok=True);clips=[]
labels={'placement':'Установка','right-line':'Одна линия','cross':'Две линии','allClear':'Чистое поле','sequence':'Рост серии и смена темы','themes':'Просмотр всех тем','defeat':'Завершение партии'}
for kind,label in labels.items():
    directory=root/('after-'+kind);d=json.loads((directory/'timing.json').read_text());frames=d['frames'];times=[f['t'] for f in frames]
    seq=media/kind;seq.mkdir(exist_ok=True)
    for i in range(round((d['end']-d['start'])*30)):
        j=max(0,bisect.bisect_right(times,d['start']+i/30)-1);target=seq/f'{i:05d}.jpg'
        target.unlink(missing_ok=True);target.symlink_to(directory/frames[j]['file'])
    dest=media/(kind+'.mp4')
    caption=f'0.20 · {label} · Заданная позиция'
    subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','30','-i',str(seq/'%05d.jpg'),'-i',str(directory/'audio.webm'),'-vf',f"drawbox=x=0:y=804:w=390:h=40:color=black@0.8:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='{caption}':x=8:y=818:fontsize=12:fontcolor=white",'-c:v','libx264','-pix_fmt','yuv420p','-crf','19','-c:a','aac','-ar','48000','-ac','2','-shortest',str(dest)],check=True);clips.append(dest)
(media/'concat.txt').write_text(''.join(f"file '{p}'\n" for p in clips))
subprocess.run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',str(media/'concat.txt'),'-c','copy','-movflags','+faststart',str(output)],check=True)
