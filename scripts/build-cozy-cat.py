"""Build the original BungZone GLB study without third-party tooling.
Run: python3 scripts/build-cozy-cat.py
"""
import json, math, struct
from pathlib import Path

blob=bytearray(); views=[]; accessors=[]; meshes=[]; nodes=[]; parts={}
colors=['#E9A23E','#F3C478','#D9533B','#49382F','#F3C0B9','#BD9373','#DFB574']
def rgba(h):
    v=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return [((c+.055)/1.055)**2.4 if c>.04045 else c/12.92 for c in v]+[1]
materials=[{'name':n,'pbrMetallicRoughness':{'baseColorFactor':rgba(c),'metallicFactor':0,'roughnessFactor':.9}} for n,c in zip(['Warm ginger fur','Cream','Winter scarf','Cocoa eyes','Inner ears','Bag strap','Fish pastry'],colors)]
def accessor(data,kind,count,component=5126):
    while len(blob)%4: blob.append(0)
    start=len(blob);blob.extend(data);views.append({'buffer':0,'byteOffset':start,'byteLength':len(data)})
    item={'bufferView':len(views)-1,'componentType':component,'count':count,'type':kind}
    if kind=='VEC3':
        values=struct.unpack('<'+'f'*(len(data)//4),data)
        item.update(min=[min(values[k::3]) for k in range(3)],max=[max(values[k::3]) for k in range(3)])
    accessors.append(item);return len(accessors)-1

def mesh(name,verts,normals,indices,material):
    # Batch static details per material, but retain meaningful animation pivots.
    part = name if name in ('Paw L','Paw R','Arm L','Arm R','Tail','Eyes') else ('Head' if name in ('Soft ear','Soft cheek head','Cheek','Tiny nose','Wonky cat smile') else 'Body')
    v,n,ids=parts.setdefault((part,material),([],[],[]));offset=len(v)//3
    v.extend(verts);n.extend(normals);ids.extend(i+offset for i in indices)

def tube(name,points,radius,material,sides=8):
    v=[];n=[];ids=[]
    for i,p in enumerate(points):
        lo=points[max(0,i-1)];hi=points[min(len(points)-1,i+1)]
        t=[hi[k]-lo[k] for k in range(3)];length=math.sqrt(sum(x*x for x in t));t=[x/length for x in t]
        ref=(0,1,0) if abs(t[1])<.95 else (1,0,0)
        u=[t[1]*ref[2]-t[2]*ref[1],t[2]*ref[0]-t[0]*ref[2],t[0]*ref[1]-t[1]*ref[0]];length=math.sqrt(sum(x*x for x in u));u=[x/length for x in u]
        w=[t[1]*u[2]-t[2]*u[1],t[2]*u[0]-t[0]*u[2],t[0]*u[1]-t[1]*u[0]]
        for j in range(sides+1):
            a=math.tau*j/sides;normal=[u[k]*math.cos(a)+w[k]*math.sin(a) for k in range(3)]
            v.extend(p[k]+radius*normal[k] for k in range(3));n.extend(normal)
    for i in range(len(points)-1):
        for j in range(sides):
            a=i*(sides+1)+j;b=a+sides+1;ids.extend((a,a+1,b,a+1,b+1,b))
    mesh(name,v,n,ids,material)

def ball(name,p,s,mat,segments=24,rings=16,taper=0):
    v=[];n=[];ids=[]
    for j in range(rings+1):
        a=math.pi*j/rings
        for i in range(segments+1):
            b=math.tau*i/segments;u=(math.sin(a)*math.cos(b),math.cos(a),math.sin(a)*math.sin(b))
            f=1-taper*u[1]
            v.extend((p[0]+s[0]*u[0]*f,p[1]+s[1]*u[1],p[2]+s[2]*u[2]*f))
            normal=[u[0]/s[0]/f,(u[1]+taper*(u[0]**2+u[2]**2)/f)/s[1],u[2]/s[2]/f];length=math.sqrt(sum(x*x for x in normal));n.extend(x/length for x in normal)
    for j in range(rings):
        for i in range(segments):
            a=j*(segments+1)+i;b=a+segments+1;ids.extend([a,a+1,b,a+1,b+1,b])
    mesh(name,v,n,ids,mat)

def ear(side):
    # Slightly mismatched little ears keep the original handmade character.
    ball('Soft ear',(side*.29,2.17 if side<0 else 2.14,.005),(.12,.21 if side<0 else .18,.115),0,taper=.85)

# A long, unadorned body and a smaller head echo the original code model.
ball('Long dumpling body',(0,.87,0),(.4,.73,.33),0,20,16)
for side in [-1,1]:
    ball('Paw L' if side<0 else 'Paw R',(side*.21,.12,.09),(.14,.11,.17),0)
    ball('Arm L' if side<0 else 'Arm R',(side*.385,.86 if side<0 else .83,.015),(.085,.19,.105),0)
    ear(side)
ball('Soft cheek head',(.015,1.86,.025),(.49,.41,.4),0,24,18)
for side in [-1,1]:
    ball('Eyes',(side*.18,1.85 if side<0 else 1.86,.414),(.033,.028,.012),3,12,8)
    ball('Cheek',(side*.29,1.71,.369),(.055,.022,.012),4,12,8)
ball('Tiny nose',(.01,1.735,.427),(.024,.016,.012),3,12,8)
# Uneven little cat mouth, with no white muzzle or shiny toy-like eyes.
for side in [-1,1]:
    for i in range(8):
        t=i/7;ball('Wonky cat smile',(.01+side*(.006+.065*t),1.704-.024*math.sin(t*math.pi),.427),(.011,.009,.007),3,8,6)
# A single curved tube replaces overlapping beads along the tail.
tail=[]
for i in range(33):
    t=i/32;tail.append((.12+.31*math.sin(t*2.4),.4+.72*t,-.31-.32*math.sin(t*2)))
tube('Tail',tail,.075,0,10)
ball('Tail',tail[-1],(.075,.075,.075),0,12,8)
# One continuous padded ring keeps the scarf soft rather than bead-like.
v=[];n=[];ids=[];segments=48;cross=12
for i in range(segments+1):
    a=math.tau*i/segments
    for j in range(cross+1):
        b=math.tau*j/cross;ca=math.cos(a);sa=math.sin(a);cb=math.cos(b);sb=math.sin(b)
        v.extend(((.33+.065*cb)*ca,1.46+.065*sb,(.28+.065*cb)*sa))
        n.extend((cb*ca,sb,cb*sa))
for i in range(segments):
    for j in range(cross):
        a=i*(cross+1)+j;b=a+cross+1;ids.extend((a,a+1,b,a+1,b+1,b))
mesh('Soft continuous scarf',v,n,ids,2)
ball('Scarf knot',(.27,1.43,.25),(.085,.08,.07),2)
ball('Scarf end',(.29,1.29,.3),(.06,.15,.04),2)
# Cross-body strap and fish-shaped pastry satchel, visible from the rear camera.
tube('Satchel strap',[(-.3+.6*(i/24),1.28-.66*(i/24),-.31-.065*math.sin(math.pi*i/24)) for i in range(25)],.025,5)
ball('Fish satchel',(.25,.49,-.43),(.26,.16,.085),6)
ball('Fish tail',(.51,.49,-.43),(.1,.12,.065),6)
ball('Fish eye',(.1,.53,-.515),(.025,.025,.012),3,8,6)
for i in range(3):ball('Pastry scoring',(.2+i*.065,.49,-.515),(.01,.08,.01),5,8,6)
# Author articulated nodes in model space, with local vertices around each pivot.
pivots={'Body':(0,0,0),'Head':(0,1.46,0),'Eyes':(0,1.85,.414),'Paw L':(-.21,.22,0),'Paw R':(.21,.22,0),'Arm L':(-.385,1.03,0),'Arm R':(.385,1.03,0),'Tail':(.12,.4,-.31)}
node_ids={}
for part,pivot in pivots.items():
    primitives=[]
    for (group,mat),(v,n,ids) in parts.items():
        if group!=part: continue
        local=[value-pivot[i%3] for i,value in enumerate(v)]
        pos=accessor(struct.pack('<'+'f'*len(local),*local),'VEC3',len(local)//3)
        norm=accessor(struct.pack('<'+'f'*len(n),*n),'VEC3',len(n)//3)
        idx=accessor(struct.pack('<'+'I'*len(ids),*ids),'SCALAR',len(ids),5125)
        primitives.append({'attributes':{'POSITION':pos,'NORMAL':norm},'indices':idx,'material':mat})
    meshes.append({'name':part,'primitives':primitives});node_ids[part]=len(nodes)
    nodes.append({'name':part,'mesh':len(meshes)-1,'translation':list(pivot)})
# Root enables a complete animated GLB rather than a renderer-only pose.
root=len(nodes)
eye=node_ids['Eyes'];head=node_ids['Head'];nodes[head]['children']=[eye]
nodes[eye]['translation']=[pivots['Eyes'][i]-pivots['Head'][i] for i in range(3)]
nodes.append({'name':'CozyRig','children':[i for i in range(root) if i!=eye]})
animations=[]
def clip(name,duration,tracks):
    samplers=[];channels=[]
    for node,path,values in tracks:
        times=[duration*i/(len(values)-1) for i in range(len(values))]
        inp=accessor(struct.pack('<'+'f'*len(times),*times),'SCALAR',len(times));accessors[inp].update(min=[0],max=[duration])
        flat=[x for value in values for x in value];out=accessor(struct.pack('<'+'f'*len(flat),*flat),'VEC4' if path=='rotation' else 'VEC3',len(values))
        samplers.append({'input':inp,'output':out,'interpolation':'LINEAR'});channels.append({'sampler':len(samplers)-1,'target':{'node':node,'path':path}})
    animations.append({'name':name,'samplers':samplers,'channels':channels})
def rotation(axis,angle):
    q=[0,0,0,math.cos(angle/2)];q[axis]=math.sin(angle/2);return q
for name,duration,moving in [('Idle',3.2,False),('Walk',.68,True)]:
    count=33;tracks=[]
    tracks.append((root,'translation',[[0,(.028*abs(math.sin(math.tau*i/(count-1))) if moving else .008*math.sin(math.tau*i/(count-1))),0] for i in range(count)]))
    tracks.append((root,'scale',[[1,1+(.012 if moving else .006)*math.sin(math.tau*i/(count-1)* (2 if moving else 1)),1] for i in range(count)]))
    for part,phase in [('Paw L',0),('Paw R',math.pi)]:
        p=pivots[part];tracks.append((node_ids[part],'translation',[[p[0],p[1]+(max(0,math.sin(math.tau*i/(count-1)+phase))*.085 if moving else 0),p[2]+(math.cos(math.tau*i/(count-1)+phase)*.13 if moving else 0)] for i in range(count)]))
    for part,axis,amplitude,phase in [('Arm L',0,.3 if moving else .025,math.pi),('Arm R',0,.3 if moving else .025,0),('Head',2,.035 if moving else .018,0),('Tail',1,.2 if moving else .12,.7)]:
        tracks.append((node_ids[part],'rotation',[rotation(axis,amplitude*math.sin(math.tau*i/(count-1)+phase)) for i in range(count)]))
    clip(name,duration,tracks)
while len(blob)%4:blob.append(0)
gltf={'asset':{'version':'2.0','generator':'BungZone articulated character'},'scene':0,'scenes':[{'nodes':[root]}],'nodes':nodes,'meshes':meshes,'materials':materials,'animations':animations,'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors}
j=json.dumps(gltf,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
out=struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
path=Path(__file__).resolve().parents[1]/'public/world/models/cozy-cat.glb';path.write_bytes(out);print(f'{path.name}: {len(out):,} bytes, {len(meshes)} articulated meshes, {len(animations)} clips')
