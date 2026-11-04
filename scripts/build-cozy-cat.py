"""Build the original BungZone GLB study without third-party tooling.
Run: python3 scripts/build-cozy-cat.py
"""
import json, math, struct
from pathlib import Path

blob=bytearray(); views=[]; accessors=[]; meshes=[]; nodes=[]
colors=['#FFF4E6','#FFFCF5','#D88983','#49382F','#F3C0B9','#BD9373','#DFB574']
def rgba(h):
    v=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return [((c+.055)/1.055)**2.4 if c>.04045 else c/12.92 for c in v]+[1]
materials=[{'name':n,'pbrMetallicRoughness':{'baseColorFactor':rgba(c),'metallicFactor':0,'roughnessFactor':.9}} for n,c in zip(['Mochi cream fur','Cream','Winter scarf','Cocoa eyes','Inner ears','Bag strap','Fish pastry'],colors)]
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
    # Small rounded ears nestled into the head instead of sharp wedges.
    ball('Soft ear',(side*.49,1.94,.015),(.17,.25,.15),0,taper=.8)
    ball('Pink ear inset',(side*.49,1.99,.145),(.075,.12,.035),4,taper=.7)

ball('Mochi body',(0,.61,0),(.56,.48,.43),0)
ball('Cream bib',(0,.61,.365),(.31,.29,.07),1)
for side in [-1,1]:
    ball('Bean paw',(side*.28,.12,.15),(.235,.12,.26),0)
    ball('Mitten',(side*.51,.59,.08),(.145,.19,.16),0)
    ear(side)
ball('Soft cheek head',(0,1.44,.025),(.77,.54,.52),0,32,24)
for side in [-1,1]:
    ball('Cream muzzle',(side*.085,1.31,.531),(.115,.07,.025),1)
    ball('Cocoa eye',(side*.19,1.48,.535),(.035,.047,.018),3)
    ball('Eye glint',(side*.19-.009,1.493,.55),(.009,.012,.006),1,12,8)
    ball('Cheek',(side*.37,1.32,.483),(.105,.045,.021),4)
ball('Button nose',(0,1.355,.56),(.027,.018,.014),3)
# Tiny smiling mouth, kept below the nose for a quiet, friendly expression.
for side in [-1,1]:
    for i in range(5):
        t=i/4;ball('Little smile',(side*(.012+.032*t),1.318-.012*math.sin(t*math.pi),.559),(.009,.008,.007),3,8,6)
for i in range(13):
    t=i/12;ball('Curled tail',(.12+.31*math.sin(t*2.4),.32+.65*t,-.31-.32*math.sin(t*2)),(.115,.12,.115),0,12,8)
# One continuous padded ring keeps the scarf soft rather than bead-like.
v=[];n=[];ids=[];segments=48;cross=12
for i in range(segments+1):
    a=math.tau*i/segments
    for j in range(cross+1):
        b=math.tau*j/cross;ca=math.cos(a);sa=math.sin(a);cb=math.cos(b);sb=math.sin(b)
        v.extend(((.42+.105*cb)*ca,.99+.095*sb,(.32+.105*cb)*sa))
        n.extend((cb*ca,sb,cb*sa))
for i in range(segments):
    for j in range(cross):
        a=i*(cross+1)+j;b=a+cross+1;ids.extend((a,a+1,b,a+1,b+1,b))
mesh('Soft continuous scarf',v,n,ids,2)
ball('Scarf knot',(.32,.96,.32),(.12,.12,.1),2)
ball('Scarf end',(.33,.79,.36),(.09,.18,.055),2)
# Cross-body strap and fish-shaped pastry satchel, visible from the rear camera.
for i in range(12):
    t=i/11;ball('Satchel strap',(-.37+.73*t,.92-.44*t,-.345),(.035,.065,.035),5,8,6)
ball('Fish satchel',(.25,.49,-.43),(.26,.16,.085),6)
ball('Fish tail',(.51,.49,-.43),(.1,.12,.065),6)
ball('Fish eye',(.1,.53,-.515),(.025,.025,.012),3,8,6)
for i in range(3):ball('Pastry scoring',(.2+i*.065,.49,-.515),(.01,.08,.01),5,8,6)
while len(blob)%4:blob.append(0)
gltf={'asset':{'version':'2.0','generator':'BungZone original character study'},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],'nodes':nodes,'meshes':meshes,'materials':materials,'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors}
j=json.dumps(gltf,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
out=struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
path=Path(__file__).resolve().parents[1]/'public/world/models/cozy-cat.glb';path.write_bytes(out);print(f'{path.name}: {len(out):,} bytes, {len(meshes)} meshes')
