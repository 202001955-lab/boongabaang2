"""Build the original BungZone GLB study without third-party tooling.
Run: python3 scripts/build-cozy-cat.py
"""
import json, math, struct
from pathlib import Path

blob=bytearray(); views=[]; accessors=[]; meshes=[]; nodes=[]
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
    pos=accessor(struct.pack('<'+'f'*len(verts),*verts),'VEC3',len(verts)//3)
    norm=accessor(struct.pack('<'+'f'*len(normals),*normals),'VEC3',len(normals)//3)
    idx=accessor(struct.pack('<'+'H'*len(indices),*indices),'SCALAR',len(indices),5123)
    meshes.append({'name':name,'primitives':[{'attributes':{'POSITION':pos,'NORMAL':norm},'indices':idx,'material':material}]})
    nodes.append({'name':name,'mesh':len(meshes)-1})

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
    ball('Tiny paw',(side*.21,.12,.09),(.14,.11,.17),0)
    ball('Little arm',(side*.385,.86 if side<0 else .83,.015),(.085,.19,.105),0)
    ear(side)
ball('Soft cheek head',(.015,1.86,.025),(.49,.41,.4),0,24,18)
for side in [-1,1]:
    ball('Quiet dot eye',(side*.18,1.85 if side<0 else 1.86,.414),(.033,.028,.012),3,12,8)
    ball('Cheek',(side*.29,1.71,.369),(.055,.022,.012),4,12,8)
ball('Tiny nose',(.01,1.735,.427),(.024,.016,.012),3,12,8)
# Uneven little cat mouth, with no white muzzle or shiny toy-like eyes.
for side in [-1,1]:
    for i in range(8):
        t=i/7;ball('Wonky cat smile',(.01+side*(.006+.065*t),1.704-.024*math.sin(t*math.pi),.427),(.011,.009,.007),3,8,6)
for i in range(13):
    t=i/12;ball('Curled tail',(.12+.31*math.sin(t*2.4),.4+.72*t,-.31-.32*math.sin(t*2)),(.075,.085,.075),0,12,8)
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
for i in range(12):
    t=i/11;ball('Satchel strap',(-.3+.6*t,1.28-.66*t,-.31),(.035,.065,.035),5,8,6)
ball('Fish satchel',(.25,.49,-.43),(.26,.16,.085),6)
ball('Fish tail',(.51,.49,-.43),(.1,.12,.065),6)
ball('Fish eye',(.1,.53,-.515),(.025,.025,.012),3,8,6)
for i in range(3):ball('Pastry scoring',(.2+i*.065,.49,-.515),(.01,.08,.01),5,8,6)
while len(blob)%4:blob.append(0)
gltf={'asset':{'version':'2.0','generator':'BungZone original character study'},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],'nodes':nodes,'meshes':meshes,'materials':materials,'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors}
j=json.dumps(gltf,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
out=struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
path=Path(__file__).resolve().parents[1]/'public/world/models/cozy-cat.glb';path.write_bytes(out);print(f'{path.name}: {len(out):,} bytes, {len(meshes)} meshes')
