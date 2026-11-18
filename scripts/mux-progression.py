"""Use captured frame timestamps and live audio; no generated replacement animation."""
import bisect,json,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]).resolve();d=json.loads((root/'timing.json').read_text());frames=d['frames'];times=[f['t'] for f in frames];seq=root/'mux';seq.mkdir(exist_ok=True)
for i in range(round((d['end']-d['start'])*30)):
 j=max(0,bisect.bisect_right(times,d['start']+i/30)-1);dest=seq/f'{i:05d}.jpg';dest.unlink(missing_ok=True);dest.symlink_to(root/frames[j]['file'])
caption='0.33 · Заданные позиции · Живой звук игры'
subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','30','-i',str(seq/'%05d.jpg'),'-i',str(root/'audio.webm'),'-vf',f"drawbox=x=0:y=804:w=390:h=40:color=black@0.8:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='{caption}':x=8:y=818:fontsize=12:fontcolor=white",'-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-c:a','aac','-ar','48000','-ac','2','-af','apad','-t',str(round((d['end']-d['start'])*30)/30),'-movflags','+faststart',str(out)],check=True)
print(out)
