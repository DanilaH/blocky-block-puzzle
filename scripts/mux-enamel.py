"""Resample actual CDP timestamps, not an assumed capture frame rate."""
import bisect, json, pathlib, subprocess
root=pathlib.Path('/workspace/scratch/fcab71b1aa53/enamel-capture/enamel-sequence')
d=json.loads((root/'timing.json').read_text());frames=d['frames'];times=[f['t'] for f in frames]
start=d['start'];duration=min(26,d['end']-start)
seq=root/'gif-frames';seq.mkdir(exist_ok=True)
for i in range(round(duration*15)):
 j=max(0,bisect.bisect_right(times,start+i/15)-1)
 target=seq/f'{i:05d}.jpg';target.unlink(missing_ok=True);target.symlink_to(root/frames[j]['file'])
out=pathlib.Path('docs/qa/enamel-ui/sequence.gif')
subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','15','-i',str(seq/'%05d.jpg'),'-filter_complex','scale=320:-1,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',str(out)],check=True)
from PIL import Image
im=Image.open(out)
for i in range(im.n_frames):im.seek(i);im.load()
print(out,im.n_frames,'decoded frames',out.stat().st_size,'bytes')
