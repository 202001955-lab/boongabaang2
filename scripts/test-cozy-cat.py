"""Validate the shipped GLB and its animation data: python3 scripts/test-cozy-cat.py."""
import json
import math
from pathlib import Path
import struct
import unittest

class CharacterAssetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw=(Path(__file__).resolve().parents[1]/'public/world/models/cozy-cat.glb').read_bytes()
        size,kind=struct.unpack_from('<I4s',cls.raw,12)
        assert kind==b'JSON'
        cls.doc=json.loads(cls.raw[20:20+size])
        cls.data=cls.raw[28+size:]

    def values(self,index):
        a=self.doc['accessors'][index];v=self.doc['bufferViews'][a['bufferView']]
        width={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
        kind={5126:'f',5125:'I',5123:'H'}[a['componentType']]
        return struct.unpack_from('<'+kind*(a['count']*width),self.data,v.get('byteOffset',0))

    def test_container_and_geometry(self):
        self.assertEqual(struct.unpack_from('<4sII',self.raw),(b'glTF',2,len(self.raw)))
        self.assertEqual(len(self.data),self.doc['buffers'][0]['byteLength'])
        for view in self.doc['bufferViews']:
            self.assertLessEqual(view.get('byteOffset',0)+view['byteLength'],len(self.data))
        for mesh in self.doc['meshes']:
            for primitive in mesh['primitives']:
                pos=self.values(primitive['attributes']['POSITION']);norm=self.values(primitive['attributes']['NORMAL'])
                self.assertTrue(all(math.isfinite(v) for v in pos+norm))
                self.assertLess(max(self.values(primitive['indices'])),len(pos)//3)
                for i in range(0,len(norm),3):
                    self.assertAlmostEqual(sum(v*v for v in norm[i:i+3]),1,places=4)

    def test_animation_tracks_loop_and_target_real_nodes(self):
        self.assertEqual({a['name'] for a in self.doc['animations']},{'Idle','Walk'})
        for animation in self.doc['animations']:
            for channel in animation['channels']:
                self.assertLess(channel['target']['node'],len(self.doc['nodes']))
                sampler=animation['samplers'][channel['sampler']]
                times=self.values(sampler['input']);self.assertEqual(times[0],0)
                self.assertTrue(all(a<b for a,b in zip(times,times[1:])))
                a=self.doc['accessors'][sampler['output']];width=4 if a['type']=='VEC4' else 3
                output=self.values(sampler['output']);self.assertEqual(len(output),len(times)*width)
                for start,end in zip(output[:width],output[-width:]):self.assertAlmostEqual(start,end,places=5)

    def test_eyes_follow_head(self):
        nodes=self.doc['nodes'];eye=next(i for i,n in enumerate(nodes) if n['name']=='Eyes')
        head=next(n for n in nodes if n['name']=='Head')
        self.assertIn(eye,head['children'])

if __name__=='__main__': unittest.main()
