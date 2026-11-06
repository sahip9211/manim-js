"""Compare lossless frame captures; emit numeric gates and labeled contact sheets."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, binary_erosion

parser=argparse.ArgumentParser()
parser.add_argument('browser_directory')
args=parser.parse_args()
directory=Path(args.browser_directory)
report=json.loads((directory/'result.json').read_text())
reference=Path(report['referenceDirectory'])
limits=report['config']['imageLimits']
rows=[]
phases=report['config']['validationPhases']
for mode in sorted(set(c['mode'] for c in report['cases'])):
    sheet=Image.new('RGB',(1200,len(phases)*255),'#222222')
    draw=ImageDraw.Draw(sheet)
    previous=None
    for i,phase in enumerate(phases):
        a=np.array(Image.open(reference/f'reference-{i}.png').convert('RGB'))
        b=np.array(Image.open(directory/f'{mode}-{i}.png').convert('RGB'))
        error=np.abs(a.astype(np.int16)-b.astype(np.int16))
        ma=np.any(a>2,axis=2);mb=np.any(b>2,axis=2)
        border=binary_dilation(ma,iterations=limits['edgeRadiusPixels'])^binary_erosion(ma,iterations=limits['edgeRadiusPixels'])
        interior=error[~border]
        p99=float(np.percentile(interior,99))
        mismatch=float(np.count_nonzero(ma^mb)/max(1,np.count_nonzero(ma|mb)))
        motion=None if previous is None else float(np.abs(b.astype(float)-previous).mean())
        nonempty=bool(np.count_nonzero(mb)>a.shape[0]*a.shape[1]*.05)
        passed=bool(nonempty and error.mean()<=limits['meanAbsoluteChannelError'] and p99<=limits['interiorP99ChannelError'] and mismatch<=limits['coverageMismatchFraction'] and (motion is None or motion>1))
        rows.append(dict(mode=mode,phase=phase,passed=passed,nonempty=nonempty,meanAbsoluteChannelError=float(error.mean()),maxChannelError=int(error.max()),interiorP99ChannelError=p99,coverageMismatchFraction=mismatch,motionFromPreviousMeanError=motion))
        for col,(data,title) in enumerate([(a,'ManimGL'),(b,'ManimJS'),(np.clip(error*16,0,255).astype(np.uint8),'Difference x16')]):
            im=Image.fromarray(data);im.thumbnail((400,225));sheet.paste(im,(col*400,i*255+30));draw.text((col*400+8,i*255+8),f'{title} | {mode} | phase {phase}',fill='white')
        previous=b.astype(float)
    sheet.save(directory/f'{mode}-comparison.png')
result={'passed':all(r['passed'] for r in rows),'limits':limits,'frames':rows,'note':'Pixel and silhouette gates plus nonempty output and change across animation times. Full-resolution PNGs are the evidence; contact sheets are previews.'}
(directory/'parity.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':result['passed'],'frames':len(rows),'maxMeanError':max(r['meanAbsoluteChannelError'] for r in rows),'maxInteriorP99':max(r['interiorP99ChannelError'] for r in rows)}))
raise SystemExit(0 if result['passed'] else 1)
