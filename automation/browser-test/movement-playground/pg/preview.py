import json,sys
from PIL import Image, ImageDraw
d=json.load(open('stations.json'))
K=26  # px per square
scn=sys.argv[1] if len(sys.argv)>1 else "default"
only=sys.argv[2:] 
for st in d['stations']:
    if only and st['id'] not in only: continue
    ox,oy=st['area'][0],st['area'][1]
    im=Image.new('RGB',(24*K+4,24*K+4),'white'); dr=ImageDraw.Draw(im)
    f=lambda x,y:((x-ox)/100*K,(y-oy)/100*K)
    for e in sorted(st['drawings'],key=lambda e:e['sort']):
        if e['t']=='rect':
            x,y=f(e['x'],e['y']); dr.rectangle([x,y,x+e['w']/100*K,y+e['h']/100*K],fill=e['fill'])
        elif e['t']=='poly':
            p=e['pts']; dr.polygon([f(p[i],p[i+1]) for i in range(0,len(p),2)],fill=e['fill'])
        elif e['t']=='line':
            p=e['pts']; dr.line([f(p[i],p[i+1]) for i in range(0,len(p),2)],fill=e['stroke'],width=max(2,e['sw']//4))
        elif e['t']=='text' and e['sort']>=10:
            x,y=f(e['x'],e['y']); dr.text((x,y),e['text'][:110],fill='black')
    sc=st['scenarios'].get(scn,{})
    for t in st['tokens']:
        if t['only'] and scn not in t['only']: continue
        x,y=sc.get('tokens',{}).get(t['name'],[t['x'],t['y']])
        x0,y0=f(x,y); col={1:'#2a9d3a',-1:'#d33',0:'#cc9'}[t['disposition']]
        dr.rectangle([x0+1,y0+1,x0+t['w']*K-1,y0+t['h']*K-1],outline=col,width=3)
        dr.text((x0+3,y0+3),t['name'].split(' ',1)[1][:9],fill='black')
    for k,p in st['points'].items():
        x,y=f(*p['c']); dr.ellipse([x-3,y-3,x+3,y+3],fill='blue')
    for r in st['regions']:
        s=r['shape']
        if s['type']=='rectangle':
            x,y=f(s['x'],s['y']); dr.rectangle([x,y,x+s['width']/100*K,y+s['height']/100*K],outline='#a0642a',width=2)
    im.save(f"prev/{st['id']}.png")
print('ok')
