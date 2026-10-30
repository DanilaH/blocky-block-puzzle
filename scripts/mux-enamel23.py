"""Compact inline GIF, resampled from actual CDP frame timestamps."""
import bisect,json,pathlib,subprocess
root=pathlib.Path('/workspace/scratch/enamel23-capture/enamel23-sequence')
d=json.loads((root/'timing.json').read_text());frames=d['frames'];times=[f['t'] for f in frames]
start=d['actions'][0]-.4;duration=d['end']-start
seq=root/'gif';seq.mkdir(exist_ok=True)
for stale in seq.glob('*.jpg'): stale.unlink()
for i in range(round(duration*12)):
 j=max(0,bisect.bisect_right(times,start+i/12)-1)
 dest=seq/f'{i:05d}.jpg';dest.unlink(missing_ok=True);dest.symlink_to(root/frames[j]['file'])
out=pathlib.Path('docs/qa/enamel-0.23/sequence.gif')
subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','12','-i',str(seq/'%05d.jpg'),'-filter_complex','scale=280:-1,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',str(out)],check=True)
from PIL import Image
im=Image.open(out)
for i in range(im.n_frames): im.seek(i);im.load()
print(im.n_frames,out.stat().st_size)
