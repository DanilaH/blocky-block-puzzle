"""Actual browser frames, first pointer release aligned; live audio on after-only video."""
import bisect,json,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]).resolve();out.mkdir(exist_ok=True)
media=root/'mux';media.mkdir(exist_ok=True);clips=[]
labels={'placement':'Постановка','right-line':'Одна линия','cross':'Две линии','allClear':'Чистое поле','sequence':'Серия'}
for kind,label in labels.items():
 for version in ['before','after']:
  directory=root/(version+'-'+kind);d=json.loads((directory/'timing.json').read_text());frames=d['frames'];times=[f['t'] for f in frames]
  start=d['actions'][0]-.4;duration=min(5.5 if kind=='sequence' else 3.5,d['end']-start)
  seq=media/(version+'-'+kind);seq.mkdir(exist_ok=True)
  for i in range(round(duration*30)):
   j=max(0,bisect.bisect_right(times,start+i/30)-1);target=seq/f'{i:05d}.jpg';target.unlink(missing_ok=True);target.symlink_to(directory/frames[j]['file'])
  dest=media/(version+'-'+kind+'.mp4');caption=f'{"0.20" if version=="before" else "0.21"} · {label} · Заданная позиция'
  subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','30','-i',str(seq/'%05d.jpg'),'-ss',str(max(0,start-d['start'])),'-i',str(directory/'audio.webm'),'-vf',f"drawbox=x=0:y=804:w=390:h=40:color=black@0.8:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='{caption}':x=8:y=818:fontsize=12:fontcolor=white",'-c:v','libx264','-pix_fmt','yuv420p','-crf','19','-c:a','aac','-ar','48000','-ac','2','-af','apad','-t',str(round(duration*30)/30),str(dest)],check=True)
  if version=='after':clips.append(dest)
 if kind in ['right-line','allClear','sequence']:
  subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(media/('before-'+kind+'.mp4')),'-i',str(media/('after-'+kind+'.mp4')),'-filter_complex','[0:v]scale=240:-1[a];[1:v]scale=240:-1[b];[a][b]hstack=shortest=1,fps=15,split[c][d];[c]palettegen=max_colors=160[p];[d][p]paletteuse=dither=sierra2_4a','-loop','0',str(out/('blocky-021-'+kind+'.gif'))],check=True)
(media/'concat.txt').write_text(''.join(f"file '{p}'\n" for p in clips))
subprocess.run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',str(media/'concat.txt'),'-c','copy','-movflags','+faststart',str(out/'blocky-0.21-effects.mp4')],check=True)
