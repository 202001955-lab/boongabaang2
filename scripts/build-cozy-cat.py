"""Build the original BungZone GLB study without third-party tooling.
Run: python3 scripts/build-cozy-cat.py
"""
import json, math, struct
from pathlib import Path

blob=bytearray(); views=[]; accessors=[]; meshes=[]; nodes=[]
colors=['#E5AD71','#FFF0D9','#DC6E67','#49382F','#F5B5A7','#B96940','#D9943F']
def rgba(h):
    v=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return [((c+.055)/1.055)**2.4 if c>.04045 else c/12.92 for c in v]+[1]
materials=[{'name':n,'pbrMetallicRoughness':{'baseColorFactor':rgba(c),'metallicFactor':0,'roughnessFactor':.9}} for n,c in zip(['Honey fur','Cream','Winter scarf','Cocoa eyes','Inner ears','Bag strap','Fish pastry'],colors)]
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

def ball(name,p,s,mat,segments=24,rings=16):
    v=[];n=[];ids=[]
    for j in range(rings+1):
        a=math.pi*j/rings
        for i in range(segments+1):
            b=math.tau*i/segments;u=(math.sin(a)*math.cos(b),math.cos(a),math.sin(a)*math.sin(b))
            v.extend(p[k]+s[k]*u[k] for k in range(3));normal=[u[k]/s[k] for k in range(3)];length=math.sqrt(sum(x*x for x in normal));n.extend(x/length for x in normal)
    for j in range(rings):
        for i in range(segments):
            a=j*(segments+1)+i;b=a+segments+1;ids.extend([a,a+1,b,a+1,b+1,b])
    mesh(name,v,n,ids,mat)

def ear(side):
    points=[(side*.18,2.02,-.13),(side*.57,2.02,-.13),(side*.49,2.51,-.03),(side*.18,2.02,.2),(side*.57,2.02,.2)]
    faces=[(0,2,1),(3,4,2),(0,3,2),(1,2,4),(0,1,4),(0,4,3)]
    v=[];n=[];ids=[]
    for face in faces:
        a,b,c=[points[i] for i in face];u=[b[k]-a[k] for k in range(3)];w=[c[k]-a[k] for k in range(3)];normal=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];l=math.sqrt(sum(x*x for x in normal))
        # Mirror changes winding.
        if side<0: normal=[-x for x in normal];face=tuple(reversed(face))
        for i in face: ids.append(len(v)//3);v.extend(points[i]);n.extend(x/l for x in normal)
    mesh('Sculpted ear',v,n,ids,0)
    ball('Pink ear inset',(side*.425,2.17,.16),(.085,.16,.025),4)

ball('Pear body',(0,.79,0),(.52,.65,.4),0)
ball('Cream bib',(0,.82,.355),(.32,.39,.085),1)
for side in [-1,1]:
    ball('Bean paw',(side*.27,.15,.12),(.235,.15,.29),1)
    ball('Mitten',(side*.49,.84,.035),(.17,.29,.19),0)
    ear(side)
ball('Soft cheek head',(0,1.76,.025),(.65,.53,.47),0)
for side in [-1,1]:
    ball('Cream muzzle',(side*.13,1.59,.459),(.17,.115,.045),1)
    ball('Cocoa eye',(side*.23,1.84,.46),(.047,.065,.027),3)
    ball('Eye glint',(side*.23-.012,1.86,.485),(.012,.018,.009),1,12,8)
    ball('Cheek',(side*.39,1.65,.413),(.095,.045,.025),4)
ball('Button nose',(0,1.66,.514),(.047,.03,.024),3)
for i in range(13):
    t=i/12;ball('Curled tail',(.12+.36*math.sin(t*2.4),.42+.85*t,-.31-.32*math.sin(t*2)),(.1,.115,.1),0,12,8)
for i in range(24):
    a=math.tau*i/24;ball('Padded scarf',(.42*math.cos(a),1.32,.32*math.sin(a)),(.14,.135,.14),2,12,8)
ball('Scarf knot',(.31,1.27,.36),(.16,.15,.13),2)
ball('Scarf end',(.32,1.04,.4),(.125,.25,.065),2)
# Cross-body strap and fish-shaped pastry satchel, visible from the rear camera.
for i in range(12):
    t=i/11;ball('Satchel strap',(-.37+.73*t,1.23-.64*t,-.345),(.035,.065,.035),5,8,6)
ball('Fish satchel',(.28,.64,-.43),(.32,.2,.1),6)
ball('Fish tail',(.59,.64,-.43),(.13,.16,.075),6)
ball('Fish eye',(.095,.7,-.525),(.025,.025,.012),3,8,6)
for i in range(3):ball('Pastry scoring',(.22+i*.085,.64,-.53),(.012,.11,.012),5,8,6)
while len(blob)%4:blob.append(0)
gltf={'asset':{'version':'2.0','generator':'BungZone original character study'},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],'nodes':nodes,'meshes':meshes,'materials':materials,'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors}
j=json.dumps(gltf,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
out=struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(blob))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(blob),b'BIN\0')+blob
path=Path(__file__).resolve().parents[1]/'public/world/models/cozy-cat.glb';path.write_bytes(out);print(f'{path.name}: {len(out):,} bytes, {len(meshes)} meshes')
