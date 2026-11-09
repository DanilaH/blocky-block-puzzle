import json, math, statistics, sys
from pathlib import Path

def summary(path):
    data=json.loads(Path(path).read_text())
    result={'scope':data['scope'],'metadata':data.get('metadata',{}),'cases':[]}
    for case in data['results']:
        samples=[]
        for row in case['untraced']:
            m=row['metrics']; out={**m}
            if 'sample' in row:
                s=row['sample']; at=s['placements'][0]['at']
                fs=[f for f,t in zip(s['frames'],s['frameTimes']) if t > at and t-f < at+8000]
                rounded=lambda x:math.floor(x*10+0.5)/10
                expected={'intervals':len(fs),'over33Raw':sum(x>33.4 for x in fs),'over33':sum(rounded(x)>33.4 for x in fs),'over34':sum(x>34 for x in fs),'over50':sum(x>50 for x in fs),'maxMs':max(fs,default=0),'p95Ms':sorted(fs)[int(len(fs)*.95)] if fs else None}
                assert expected==m,(path,case['index'],expected,m)
                out.update(meanMs=statistics.mean(fs),over25=sum(x>25 for x in fs),excessOver16_667Ms=sum(max(0,x-1000/60) for x in fs))
            samples.append(out)
        trace=case['trace']; totals=trace['totals']; study=trace['study']
        result['cases'].append({'index':case['index'],'variant':case['variant'],'untraced':samples,'layers':trace['layerCount'],'rasterWallMs':totals.get('RasterTask',{}).get('wallMs'), 'paintWallMs':totals.get('Paint',{}).get('wallMs'),'study':study, 'firstWarmupPreparationMs':case['warmups'][0]['study']['preparationMs'],'firstWarmupInkPreparationMs':case['warmups'][0]['study']['ink']['preparationMs'],'errors':case['errors']})
    return result

if __name__=='__main__':
    d=summary(sys.argv[1]); Path(sys.argv[2]).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
    for c in d['cases']:
        print(c['index'],c['variant'],[(m['over33'],m.get('over25'),round(m['maxMs'],1),round(m.get('meanMs',0),2)) for m in c['untraced']], 'layers',c['layers'],'raster',round(c['rasterWallMs'],1))
